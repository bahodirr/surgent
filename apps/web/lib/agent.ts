import { Experimental_Agent as Agent, stepCountIs, tool, wrapLanguageModel, defaultSettingsMiddleware } from 'ai';
import { z } from 'zod';
import { readFile, writeFile } from 'node:fs/promises';
import { gateway } from '@ai-sdk/gateway';
import { join } from 'node:path';

// PLAN.md lives on the server as the source of truth
const PLAN_PATH = join(process.cwd(), 'PLAN.md');

// Helper: Read plan file (returns empty string if missing)
async function readPlanFile(): Promise<string> {
	try {
		return await readFile(PLAN_PATH, 'utf8');
	} catch {
		return '';
	}
}

// Helper: Write plan file
async function writePlanFile(content: string): Promise<void> {
	await writeFile(PLAN_PATH, content, 'utf8');
}

// Helper: Ensure trailing newline
function ensureNewline(s: string): string {
	return s.endsWith('\n') ? s : s + '\n';
}

// Wrap gateway model with reasoning effort for OpenAI
const baseModel = gateway('openai/gpt-5-chat-latest');

export const codingAgent = new Agent({
	model: baseModel,
	system: `You are a friendly, concise product partner.
Goal: help the user shape scope and decide if a backend is needed.

Style:
- Be conversational and direct. Short sentences. Plain English.
- Ask one question at a time. Keep replies to 2–5 sentences.

Process:
- First, call readPlan to load PLAN.md (continue even if it's empty).
- Briefly restate what you heard, then ask up to 2–3 quick clarifying questions.

Backend decision:
- Decide "backend: yes" if any apply: multi‑user accounts, shared data, server persistence beyond local storage, real‑time sync, webhooks/scheduled jobs, secret‑bearing APIs, heavy/long‑running compute, or compliance/security needs.
- Otherwise choose "backend: no (client‑only)".
- Explain the decision in 1–2 short lines.

Planning:
- Use updatePlan to record key notes and the backend decision.
- When the user confirms or implies readiness, call startProject with a one‑line summary that includes the backend decision (e.g., "Todo app — backend: no").

Keep things simple. Avoid overengineering.`,
	tools: {
		readPlan: tool({
			description: 'Read the current PLAN.md to see what has been planned so far.',
			inputSchema: z.object({}),
			execute: async () => {
				const content = await readPlanFile();
				return {
					content: content || '(Plan is empty - not created yet)',
					isEmpty: !content
				};
			},
		}),

		updatePlan: tool({
			description: 'Update PLAN.md. Can append new sections or replace existing ones.',
			inputSchema: z.object({
				mode: z.enum(['append', 'replace']).describe('append: add to end; replace: update a section'),
				sectionTitle: z.string().optional().describe('Section heading (without ##)'),
				content: z.string().describe('The content to write'),
			}),
			execute: async ({ mode, sectionTitle, content }) => {
				let current = await readPlanFile();
				
				// Initialize if empty
				if (!current) {
					current = '# Project Plan\n\n';
				}

				if (mode === 'append') {
					const block = sectionTitle 
						? `\n## ${sectionTitle}\n\n${content}\n`
						: `\n${content}\n`;
					const updated = ensureNewline(current) + block;
					await writePlanFile(updated);
					return { 
						success: true, 
						mode, 
						message: sectionTitle ? `Added section: ${sectionTitle}` : 'Appended content'
					};
				}

				// Replace mode: find and update section
				if (!sectionTitle) {
					return { success: false, error: 'sectionTitle required for replace mode' };
				}

				const lines = ensureNewline(current).split('\n');
				const normalized = (s: string) => s.trim().toLowerCase();
				const targetNorm = normalized(sectionTitle);
				
				const startIdx = lines.findIndex(
					line => line.startsWith('## ') && normalized(line.slice(3)) === targetNorm
				);

				if (startIdx === -1) {
					// Section doesn't exist, create it
					const updated = ensureNewline(current) + `\n## ${sectionTitle}\n\n${content}\n`;
					await writePlanFile(updated);
					return { 
						success: true, 
						mode: 'replace', 
						created: true,
						message: `Created new section: ${sectionTitle}`
					};
				}

				// Find end of section (next ## or EOF)
				let endIdx = lines.length;
				for (let i = startIdx + 1; i < lines.length; i++) {
					if (lines[i]?.startsWith('## ')) {
						endIdx = i;
						break;
					}
				}

				// Replace section content
				const before = lines.slice(0, startIdx + 1);
				const after = lines.slice(endIdx);
				const updated = [...before, '', content, '', ...after].join('\n');
				
				await writePlanFile(updated);
				return { 
					success: true, 
					mode: 'replace',
					message: `Updated section: ${sectionTitle}`
				};
			},
		}),

		startProject: tool({
			description: 'Start the project once scope is clear and backend yes/no is decided. Records a kickoff summary.',
			inputSchema: z.object({
				summary: z.string().optional().describe('One-line reminder of the agreed scope or next step'),
			}),
			execute: async ({ summary }) => {
				let current = await readPlanFile();

				if (!current) {
					current = '# Project Plan\n\n';
				}

				const base = ensureNewline(current);
				const kickoffSection = /(^|\n)## Project Kickoff[\s\S]*?(?=\n## |\n$)/;
				const trimmedSummary = summary?.trim();
				const block = `## Project Kickoff\n\nStarted: ${new Date().toISOString()}${trimmedSummary ? `\nSummary: ${trimmedSummary}` : ''}\n`;

				const updated = kickoffSection.test(base)
					? base.replace(kickoffSection, (_match, prefix) => `${prefix}${block}`)
					: `${base}\n${block}`;

				await writePlanFile(ensureNewline(updated));

				return {
					success: true,
					message: 'Project kickoff recorded.',
				};
			},
		}),
	},
	stopWhen: stepCountIs(10),
});

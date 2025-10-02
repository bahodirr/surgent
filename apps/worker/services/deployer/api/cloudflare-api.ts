import { AssetManifest, UploadAssetSession, WorkerMetadata } from '../types';
import { getMimeType } from '../utils/index';

/**
 * Cloudflare API client for Worker deployment operations
 */
export class CloudflareAPI {
	private readonly accountId: string;
	private readonly apiToken: string;
	private readonly baseUrl = 'https://api.cloudflare.com/client/v4';

	constructor(accountId: string, apiToken: string) {
		this.accountId = accountId;
		this.apiToken = apiToken;
	}

	/**
	 * Generate request headers with authorization
	 */
	private getHeaders(contentType?: string): Record<string, string> {
		const headers: Record<string, string> = {
			Authorization: `Bearer ${this.apiToken}`,
		};
		if (contentType) {
			headers['Content-Type'] = contentType;
		}
		return headers;
	}

	/**
	 * Create an asset upload session with Cloudflare
	 * Returns JWT token and list of files that need uploading
	 */
	async createAssetUploadSession(
		scriptName: string,
		manifest: AssetManifest,
		dispatchNamespace?: string,
	): Promise<UploadAssetSession> {
		const url = dispatchNamespace
			? `${this.baseUrl}/accounts/${this.accountId}/workers/dispatch/namespaces/${dispatchNamespace}/scripts/${scriptName}/assets-upload-session`
			: `${this.baseUrl}/accounts/${this.accountId}/workers/scripts/${scriptName}/assets-upload-session`;

		const response = await fetch(url, {
			method: 'POST',
			headers: this.getHeaders('application/json'),
			body: JSON.stringify({ manifest }),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(
				`Failed to create asset upload session: ${response.status} - ${error}`,
			);
		}

		const data = (await response.json()) as any;
		return data.result;
	}

	/**
	 * Upload a batch of assets to Cloudflare
	 * Returns completion token if this is the last batch
	 */
	async uploadAssetBatch(
		uploadToken: string,
		fileHashesToUpload: string[],
		fileContents: Map<string, Buffer>,
		hashToPath: Map<string, string>,
	): Promise<string | null> {
		const url = `${this.baseUrl}/accounts/${this.accountId}/workers/assets/upload?base64=true`;

		const formData = new FormData();

		// Add each file as base64 string with proper MIME type
		for (const hash of fileHashesToUpload) {
			const content = fileContents.get(hash);
			if (!content) {
				throw new Error(`Content not found for hash: ${hash}`);
			}
			const base64Content = content.toString('base64');

			// Get MIME type based on file path
			const filePath = hashToPath.get(hash);
			const mimeType = filePath
				? getMimeType(filePath)
				: 'application/octet-stream';

 			// Create a Blob with the base64 string and proper MIME type
			// This ensures Content-Type is preserved when serving assets
			const blob = new Blob([base64Content], { type: mimeType });
			formData.append(hash, blob, hash);
		}

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${uploadToken}`,
			},
			body: formData,
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(
				`Failed to upload assets: ${response.status} - ${error}`,
			);
		}

		// Status 201 indicates all files uploaded, returns completion token
		if (response.status === 201) {
			const data = (await response.json()) as any;
			return data.result?.jwt || null;
		}

		return null;
	}

	/**
	 * Deploy a Worker script to Cloudflare
	 * Includes metadata, bindings, and assets configuration
	 */
	async deployWorker(
		scriptName: string,
		metadata: WorkerMetadata,
		workerContent: string,
		dispatchNamespace?: string,
		additionalModules?: Map<string, string>,
	): Promise<void> {
		const url = dispatchNamespace
			? `${this.baseUrl}/accounts/${this.accountId}/workers/dispatch/namespaces/${dispatchNamespace}/scripts/${scriptName}`
			: `${this.baseUrl}/accounts/${this.accountId}/workers/scripts/${scriptName}`;

		const formData = new FormData();
		formData.append('metadata', JSON.stringify(metadata));

		const workerBlob = new Blob([workerContent], {
			type: 'application/javascript+module',
		});
		formData.append('index.js', workerBlob, 'index.js');

		if (additionalModules) {
			for (const [moduleName, moduleContent] of additionalModules.entries()) {
				const moduleBlob = new Blob([moduleContent], {
					type: 'application/javascript+module',
				});
				formData.append(moduleName, moduleBlob, moduleName);
			}
		}

		const response = await fetch(url, {
			method: 'PUT',
			headers: {
				Authorization: `Bearer ${this.apiToken}`,
			},
			body: formData,
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(
				`Failed to deploy worker: ${response.status} - ${error}`,
			);
		}

		console.log(`✅ Worker deployed successfully: ${scriptName}`);
	}

}
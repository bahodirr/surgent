import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
 
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    console.log('userId', userId);
    if (!userId) {
      return null;
    }
    return await ctx.db.get(userId as Id<'users'>);
  },
});
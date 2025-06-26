//this file contains the logic for matching users for LFG
// input: two users
// output: a numerical score representing how well they match

const { User } = require('../../models/user');

/**
 * Calculates the match score between two users by their discordUsernames.
 * @param {string} usernameA
 * @param {string} usernameB
 * @returns {Promise<number>} match score (decimal)
 */
async function calculateMatchScore(usernameA, usernameB) {
  // Fetch both users in one query
  const users = await User.find({ discordUsername: { $in: [usernameA, usernameB] } });
  if (users.length !== 2) throw new Error('One or both users not found');
  const [user1, user2] = users[0].discordUsername === usernameA ? [users[0], users[1]] : [users[1], users[0]];

  // Helper to get intersection percent
  function percentIntersection(arr1, arr2) {
    if (!Array.isArray(arr1) || !Array.isArray(arr2) || arr1.length === 0 || arr2.length === 0) return 0;
    const set2 = new Set(arr2.map(String));
    const intersection = arr1.filter(x => set2.has(String(x)));
    return intersection.length / Math.max(arr1.length, arr2.length);
  }

  let score = 0;
  score += percentIntersection(user1.platforms, user2.platforms) * 0.5;
  score += percentIntersection(user1.genres, user2.genres);
  score += percentIntersection(user1.gameIds, user2.gameIds) * 1.5;
  score += percentIntersection(user1.userIds, user2.userIds) * 0.5;
  if (user1.location?.country && user1.location.country === user2.location?.country) score += 0.05;
  if (user2.profile?.aboutMe) score += 0.05;
  if (user2.avatar?.secure) score += 0.05;
  if (user2.personalityProfile?.personality) score += 0.05;
  return score;
}

module.exports = {
  calculateMatchScore
};
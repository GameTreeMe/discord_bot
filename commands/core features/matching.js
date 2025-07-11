//this file contains the logic for matching users for LFG
// input: two users
// output: a numerical score representing how well they match

const { User } = require('../../models/user');

/**
 * Helper: Shallow intersection of two arrays
 */
function intersection(arr1 = [], arr2 = []) {
  return arr1.filter((value) => arr2.includes(value));
}

/**
 * Helper: Calculate Euclidean distance between two [lat, lon] pairs
 */
function getDistance(coords1, coords2) {
  if (
    !Array.isArray(coords1) ||
    !Array.isArray(coords2) ||
    coords1.length !== 2 ||
    coords2.length !== 2
  )
    return 0;
  const [lat1, lon1] = coords1;
  const [lat2, lon2] = coords2;
  // Haversine formula for km
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Helper: Are users from the same country?
 */
function sameCountry(user1, user2) {
  return (
    user1.location &&
    user2.location &&
    user1.location.country &&
    user2.location.country &&
    user1.location.country === user2.location.country
  );
}

/**
 * Helper: Calculate age from birthday (ISO string)
 */
function calculateAge(birthday) {
  if (!birthday) return undefined;
  const birthDate = new Date(birthday);
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const m = now.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/**
 * Constants (simplified for this implementation)
 */
const SAME_PLATFORMS_MULTIPLIER = 2;
const COMPETED_ALL_COMPATIBILITY_QUESTIONS_MULTIPLIER = 2;
const COMPETED_ONE_COMPATIBILITY_QUESTIONS_MULTIPLIER = 0.2;
const FULL_TEST_COMPLETED_BONUS_MULTIPLIER = 1;
const ABOUT_ME_MULTIPLIER = 1;
const AVATAR_MULTIPLIER = 1;
const SAME_COUNTRY_MULTIPLIER = 1;
const DISTANCE_MAX = 12000; // km for normalization

function getAboutMeMultiplier(hasAboutMe) {
  return hasAboutMe ? ABOUT_ME_MULTIPLIER : 0;
}

function getAvatarMultiplier(hasAvatar) {
  return hasAvatar ? AVATAR_MULTIPLIER : 0;
}

function getSameCountryMultiplier(isSame) {
  return isSame ? SAME_COUNTRY_MULTIPLIER : 0;
}

function getLastActiveSecondsFactor(lastActiveSeconds) {
  // More recent activity is better, max factor 1, min 0
  if (lastActiveSeconds == null) return 0;
  if (lastActiveSeconds < 60 * 60) return 1;
  if (lastActiveSeconds < 60 * 60 * 24) return 0.7;
  if (lastActiveSeconds < 60 * 60 * 24 * 7) return 0.4;
  return 0.1;
}

function getDistanceMultiplier(distance) {
  // Closer is better. Normalize between 0 (far) and 1 (same spot)
  if (typeof distance !== "number") return 0;
  return 1 - Math.min(distance, DISTANCE_MAX) / DISTANCE_MAX;
}

/**
 * Calculate compatibility factor between two users
 */
function calculateMatchingFactor(hostUser, otherUser) {
  // Platforms/Genres match
  const samePlatforms = intersection(hostUser.platforms || [], otherUser.platforms || []);
  const pctPlatformsMatch =
    (samePlatforms.length || 0) / Math.max(1, (hostUser.platforms || []).length);

  const sameGenres = intersection(hostUser.genres || [], otherUser.genres || []);
  const pctGenresMatch =
    (sameGenres.length || 0) / Math.max(1, (hostUser.genres || []).length);

  const userSameCriteriaScore =
    pctPlatformsMatch * SAME_PLATFORMS_MULTIPLIER + pctGenresMatch;

  // Profile fields
  const hasAboutMe = !!(otherUser.profile && otherUser.profile.aboutMe);
  const hasAvatar = !!(otherUser.avatar && otherUser.avatar !== "default");
  const isSameCountry = sameCountry(hostUser, otherUser);

  // Activity
  const now = Date.now();
  const lastActiveAt = new Date(otherUser.lastActiveAt || 0).getTime();
  const lastActiveSeconds = lastActiveAt ? Math.floor((now - lastActiveAt) / 1000) : 0;

  // Distance
  let distance = 0;
  if (
    hostUser.location &&
    hostUser.location.coordinates &&
    otherUser.location &&
    otherUser.location.coordinates
  ) {
    distance = getDistance(
      hostUser.location.coordinates,
      otherUser.location.coordinates
    );
  }
  const aboutFactor = getAboutMeMultiplier(hasAboutMe);
  const avatarFactor = getAvatarMultiplier(hasAvatar);
  const countryFactor = getSameCountryMultiplier(isSameCountry);
  const lastActiveFactor = getLastActiveSecondsFactor(lastActiveSeconds);
  const distanceFactor = getDistanceMultiplier(distance);

  // Simplified: Personality test compatibility (if both have answers)
  let personalityFactor = 0;
  if (
    Array.isArray(hostUser.personalityAnswers) &&
    Array.isArray(otherUser.personalityAnswers) &&
    hostUser.personalityAnswers.length &&
    otherUser.personalityAnswers.length &&
    hostUser.personalityAnswers.length === otherUser.personalityAnswers.length
  ) {
    let shared = 0;
    let total = hostUser.personalityAnswers.length;
    let score = 0;
    for (let i = 0; i < total; i++) {
      if (
        typeof hostUser.personalityAnswers[i] === "number" &&
        typeof otherUser.personalityAnswers[i] === "number"
      ) {
        shared++;
        score += 100 - Math.abs(hostUser.personalityAnswers[i] - otherUser.personalityAnswers[i]);
      }
    }
    if (shared === total && total > 0) {
      personalityFactor += COMPETED_ALL_COMPATIBILITY_QUESTIONS_MULTIPLIER;
      personalityFactor += FULL_TEST_COMPLETED_BONUS_MULTIPLIER;
    } else if (shared > 0) {
      personalityFactor += (score / (100 * shared)) * (COMPETED_ONE_COMPATIBILITY_QUESTIONS_MULTIPLIER * shared);
    }
  }

  // Final match score (product, as in original logic)
  const base = 1 + aboutFactor + avatarFactor + countryFactor + lastActiveFactor + distanceFactor + personalityFactor;
  return userSameCriteriaScore * base;
}


/**
 * Calculates the match score between two users by their discordUsernames.
 * @param {string} usernameA
 * @param {string} usernameB
 * @returns {Promise<number>} match score (decimal)
 */
async function calculateMatchScore(usernameA, usernameB) {
  // Fetch both users in one query
  const users = await User.find({ discordUsername: { $in: [usernameA, usernameB] } });
  if (users.length !== 2) {
    throw new Error('One or both users not found');
  }
  const [user1, user2] = users[0].discordUsername === usernameA ? [users[0], users[1]] : [users[1], users[0]];
  const score = calculateMatchingFactor(user1, user2);
  return score;
}

module.exports = {
  calculateMatchScore
};
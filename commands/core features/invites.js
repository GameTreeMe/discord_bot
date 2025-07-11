const { Session } = require('../../models/session');
const { User } = require('../../models/user');
const { calculateMatchScore } = require('./matching');
const { sendLFGInviteDM } = require('../utility/dm');

/**
 * Invite top-matching users to an LFG session.
 * @param {string} sessionId - The session to invite for.
 * @param {Client} client - Discord client instance.
 * @param {Array<string>} onlineUserIds - Array of Discord user IDs who are online and not in a call.
 */
async function inviteTopMatches(sessionId, client, onlineUserIds) {
  // 1. Fetch session and creator
  const session = await Session.findOne({ sessionId });
  if (!session) {
    console.error(`Session ${sessionId} not found`);
    throw new Error('Session not found');
  }
  const creator = await User.findOne({ discordId: session.creatorDiscordId });
  if (!creator) {
    console.error(`Creator with Discord ID ${session.creatorDiscordId} not found`);
    throw new Error('Session creator not found');
  }

  // 2. Fetch all online users (not in a call) and filter sequentially
  const onlineUsers = await User.find({ discordId: { $in: onlineUserIds } });

  // Filter by opt-in
  const optInUsers = onlineUsers.filter(u => u.lfgInviteOptIn === true);

  // Filter by platform
  const platformFilteredUsers = optInUsers.filter(u => u.platforms && u.platforms.includes(session.platform));

  // Filter by game
  const gameFilteredUsers = platformFilteredUsers.filter(u => u.gameIds && u.gameIds.some(gameId => gameId.equals(session.gameId)));

  const users = gameFilteredUsers;

  if (users.length === 0) {
    return;
  }

  // Remove the creator from the list
  const filtered = users.filter(u => u.discordId !== session.creatorDiscordId);

  // 3. If >100, randomly select 100
  let candidates = filtered;
  if (candidates.length > 100) {
    candidates = candidates.sort(() => 0.5 - Math.random()).slice(0, 100);
  }

  // 4. Compute match score and sort
  const scored = [];
  for (const u of candidates) {
    // Skip if user does not have a discordUsername (not linked to GameTree)
    if (!u.discordUsername) continue;
    const score = await calculateMatchScore(creator.discordUsername, u.discordUsername);
    scored.push({ user: u, score });
  }
  scored.sort((a, b) => b.score - a.score);
  // Only invite maxPlayers - 1 initially
  const initialInviteCount = Math.max(0, session.maxPlayers - 1);
  const topN = scored.slice(0, initialInviteCount);
  const waitingList = scored.slice(initialInviteCount);

  // 5. Send DM invites to initial group and track message IDs
  let inviteIndex = 0;
  let invitesSent = 0;
  const maxInvites = Math.max(0, session.maxPlayers - 1);
  const totalToInvite = Math.min(scored.length, session.maxPlayers);
  session.personalizedInvites = session.personalizedInvites || [];

  async function sendNextBatch() {
    // Calculate how many spots are left
    const refreshed = await Session.findOne({ sessionId });
    if (!refreshed) return;
    const spotsLeft = Math.max(0, refreshed.maxPlayers - refreshed.participants.length);
    if (spotsLeft === 0 || invitesSent >= totalToInvite) {
      return;
    }
    // Send up to spotsLeft invites from the waiting list
    let sentThisBatch = 0;
    while (sentThisBatch < spotsLeft && inviteIndex < scored.length && invitesSent < totalToInvite) {
      const { user } = scored[inviteIndex];
      const dmMsg = await sendLFGInviteDM(client, user.discordId, session.sessionId);
      if (dmMsg && dmMsg.id) {
        refreshed.personalizedInvites.push({ userId: user.discordId, messageId: dmMsg.id });
        await refreshed.save();
      }
      inviteIndex++;
      invitesSent++;
      sentThisBatch++;
    }
    // After 1 minute, delete unaccepted invites and send more if needed
    setTimeout(async () => {
      const updatedSession = await Session.findOne({ sessionId });
      if (!updatedSession) return;
      // Delete DMs for users who did not accept within a minute
      const toDelete = (updatedSession.personalizedInvites || []).filter(invite => {
        return !updatedSession.participants.some(p => p.discordId === invite.userId);
      });
      for (const invite of toDelete) {
        try {
          const userObj = await client.users.fetch(invite.userId);
          const dmChannel = await userObj.createDM();
          const msg = await dmChannel.messages.fetch(invite.messageId);
          if (msg) await msg.delete();
        } catch (e) { /* ignore errors */ }
      }
      // Remove deleted invites from session
      updatedSession.personalizedInvites = (updatedSession.personalizedInvites || []).filter(invite => {
        return updatedSession.participants.some(p => p.discordId === invite.userId);
      });
      await updatedSession.save();
      // Try to send more if session is not full and we have more candidates
      if (updatedSession.status !== 'full' && invitesSent < totalToInvite) {
        await sendNextBatch();
      }
    }, 60000); // 1 minute
  }

  // Start the invite process
  await sendNextBatch();

  // Also, delete all personalized invites if session becomes full
  const sessionWatcher = setInterval(async () => {
    const refreshed = await Session.findOne({ sessionId });
    if (!refreshed) return clearInterval(sessionWatcher);
    if (refreshed.status === 'full') {
      for (const invite of refreshed.personalizedInvites || []) {
        try {
          const userObj = await client.users.fetch(invite.userId);
          const dmChannel = await userObj.createDM();
          const msg = await dmChannel.messages.fetch(invite.messageId);
          if (msg) await msg.delete();
        } catch (e) { /* ignore errors */ }
      }
      refreshed.personalizedInvites = [];
      await refreshed.save();
      clearInterval(sessionWatcher);
    }
  }, 5000); // Check every 5 seconds
}

module.exports = { inviteTopMatches };
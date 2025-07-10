const { Session } = require('../models/session');

/**
 * Sends a summary of the gaming session to all participants via DM.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @param {object} session The session document from the database.
 */
async function sendSessionSummary(client, session) {
  if (!session || !session.participants || session.participants.length === 0) {
    return;
  }

  const gameName = session.gameName;
  // Create a mention string for each participant
  const participantMentions = session.participants.map(p => `<@${p.discordId}>`).join(', ');

  const summaryMessage = `**Session Summary**\n\n**Game:** ${gameName}\n**Players:** ${participantMentions}\n\nGameTree hopes you enjoyed your gaming session.`;

  for (const participant of session.participants) {
    try {
      const user = await client.users.fetch(participant.discordId);
      if (user) {
        await user.send(summaryMessage);
      }
    } catch (error) {
      console.error(`Could not send session summary to user ${participant.discordId}:`, error);
    }
  }
}

/**
 * Ends an LFG session, cleans up channels/posts, and sends a summary.
 * @param {object} session The session document from the database.
 * @param {import('discord.js').Guild} guild The guild where the session exists.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
async function endLFGSession(session, guild, client) {
  // 1. Delete LFG post messages
  for (let i = 0; i < session.lfgChannelIds.length; i++) {
    const channelId = session.lfgChannelIds[i];
    const msgId = session.lfgMessageIds[i];
    if (!channelId || !msgId) continue;
    try {
      const channel = guild.channels.cache.get(channelId);
      if (channel) {
        const msg = await channel.messages.fetch(msgId).catch(() => null);
        if (msg) await msg.delete();
      }
    } catch (err) {
      console.error(`Failed to delete LFG message ${msgId} in channel ${channelId}:`, err);
    }
  }

  // 2. Delete temporary text and voice channels
  for (const channelId of [session.textChannelId, session.voiceChannelId]) {
    if (!channelId) continue;
    try {
      const channel = guild.channels.cache.get(channelId);
      if (channel) await channel.delete('LFG session ended');
    } catch (err) {
      console.error(`Failed to delete temp channel ${channelId}:`, err);
    }
  }

  // 3. Mark session as closed in the database
  session.status = 'closed';
  session.callEndedAt = new Date();
  await session.save();

  // 4. Send the summary message to all participants
  await sendSessionSummary(client, session);
}

module.exports = { endLFGSession };

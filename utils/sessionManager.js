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
      const channel = await client.channels.fetch(channelId);
      if (channel) {
        await channel.messages.delete(msgId);
      }
    } catch (err) {
      // If the error is "Unknown Message" (code 10008), it's safe to ignore.
      // This happens if the message was already deleted by other logic (e.g., when the session became full).
      if (err.code === 10008) {
        console.log(`Tried to delete message ${msgId}, but it was already gone. Ignoring.`);
      } else {
        console.error(`Failed to delete LFG message ${msgId} in channel ${channelId}:`, err);
      }
    }
  }

  // 1.5. Delete personalized invite DMs
  if (session.personalizedInvites && session.personalizedInvites.length > 0) {
    for (const invite of session.personalizedInvites) {
      try {
        const user = await client.users.fetch(invite.userId);
        const dmChannel = await user.createDM();
        await dmChannel.messages.delete(invite.messageId);
      } catch (err) {
        // Ignore errors if message is already gone or user has DMs closed/blocked the bot.
        if (err.code === 10008 /* Unknown Message */ || err.code === 50007 /* Cannot send messages to this user */) {
          console.log(`Could not delete DM for user ${invite.userId}, it might already be gone or DMs are blocked.`);
        } else {
          console.error(`Failed to delete personalized invite for user ${invite.userId}:`, err);
        }
      }
    }
  }

  // 2. Delete temporary text and voice channels
  for (const channelId of [session.textChannelId, session.voiceChannelId]) {
    if (!channelId) continue;
    try {
      const channel = await client.channels.fetch(channelId).catch(() => null);
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

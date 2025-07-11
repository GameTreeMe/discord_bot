//this should be used to send a direct message to a user
const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { Session } = require('../../models/session');
const { User } = require('../../models/user');

/**
 * Sends a personalized LFG invite DM to a target user by Discord user ID.
 * @param {Client} client - Your Discord bot client instance.
 * @param {string} targetUserId - The Discord user ID to DM.
 * @param {string} sessionId - The sessionId to pull session info from DB.
 * @returns {Promise<Boolean>} true if sent successfully, false if failed (e.g. DMs closed)
 */
async function sendLFGInviteDM(client, targetUserId, sessionId) {
  try {
    // 1. Resolve the user object from Discord user ID
    const userObj = await client.users.fetch(targetUserId);

    // 2. Fetch session and creator info from DB
    const session = await Session.findOne({ sessionId });
    if (!session) throw new Error('Session not found');
    const creator = await User.findOne({ discordId: session.creatorDiscordId });

    // 3. Compose the embed
    const embed = new EmbedBuilder()
      .setTitle(`🎮 LFG Match: ${session.gameName}`)
      .setDescription([
        `**Platform:** ${session.platform}`,
        creator && creator.username ? `**With:** ${creator.username}` : '',
        session.description ? `**Note:** ${session.description}` : '',
      ].filter(Boolean).join('\n'))
      .setFooter({ text: 'Powered by GameTree Matching' })
      .setColor(0x6A5ACD);

    // 4. Create the "Join" button
    const joinButton = new ButtonBuilder()
      .setCustomId(`join_lfg_${session.sessionId}`)
      .setLabel('Join Session')
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(joinButton);

    // 5. Send the DM
    const dmMessage = await userObj.send({
      content: `You’ve been matched for a game session!`,
      embeds: [embed],
      components: [row],
    });

    return dmMessage;
  } catch (err) {
    // DMs might be closed or user not found
    if (err.code === 50007) {
      // DMs are closed, this is not an error in our logic
    } else {
      console.error(`Error sending DM to user ${targetUserId}:`, err);
    }
    return null;
  }
}

module.exports = { sendLFGInviteDM };
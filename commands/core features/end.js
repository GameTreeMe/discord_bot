const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const { Session } = require('../../models/session');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('end')
    .setDescription('End your active LFG session and clean up channels/posts.'),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const userId = interaction.user.id;
    const guild = interaction.guild;

    // Find the open session by creatorDiscordId
    const session = await Session.findOne({ creatorDiscordId: userId, status: { $in: ['open', 'full'] } });
    if (!session) {
      await interaction.editReply('❌ You do not have any ongoing gaming sessions right now.');
      return;
    }

    // Ask for confirmation with a button
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('confirm_end_session')
        .setLabel('End Session')
        .setStyle(ButtonStyle.Danger)
    );
    await interaction.editReply({
      content: '⚠️ Are you sure you want to end your LFG session? This will delete the temporary channels and post.',
      components: [row],
      flags: MessageFlags.Ephemeral
    });

    // Wait for button interaction from the user
    try {
      const confirmation = await interaction.channel.awaitMessageComponent({
        filter: i => i.user.id === userId && i.customId === 'confirm_end_session',
        time: 15000,
        componentType: ComponentType.Button
      });
      await confirmation.deferUpdate();
    } catch (err) {
      await interaction.editReply({ content: '❌ Session end cancelled (no confirmation received).', components: [], flags: MessageFlags.Ephemeral });
      return;
    }

    // Attempt to kick users from the voice channel(s) before deleting
    const channelIds = session.lfgChannelIds || [];
    for (const channelId of channelIds) {
      const channel = guild.channels.cache.get(channelId);
      if (channel && channel.type === 2) { // 2 = GUILD_VOICE
        for (const [memberId, member] of channel.members) {
          try {
            await member.voice.disconnect('LFG session ended');
          } catch (err) {
            // Ignore errors (user may have already left)
          }
        }
      }
    }

    // Attempt to delete temp text and voice channels (by textChannelId and voiceChannelId)
    const { textChannelId, voiceChannelId, lfgChannelIds = [], lfgMessageIds = [] } = session;
    let deletedChannels = [];
    for (const channelId of [textChannelId, voiceChannelId]) {
      if (!channelId) continue;
      try {
        const channel = guild.channels.cache.get(channelId);
        if (channel) {
          await channel.delete('LFG session ended');
          deletedChannels.push(channelId);
        }
      } catch (err) {
        // Ignore errors (channel may already be deleted)
      }
    }

    // Attempt to delete LFG post messages by matching lfgChannelIds and lfgMessageIds by index
    for (let i = 0; i < lfgChannelIds.length; i++) {
      const channelId = lfgChannelIds[i];
      const msgId = lfgMessageIds[i];
      if (!channelId || !msgId) continue;
      try {
        const channel = guild.channels.cache.get(channelId);
        if (channel) {
          const msg = await channel.messages.fetch(msgId);
          if (msg) await msg.delete();
        }
      } catch (err) {
        // Ignore errors (message or channel may already be deleted)
      }
    }

    // Mark session as closed
    session.status = 'closed';
    session.callEndedAt = new Date();
    await session.save();

    try {
      await interaction.editReply({ content: '✅ Your LFG session has been ended. Temporary channels and posts have been deleted.', components: [], flags: MessageFlags.Ephemeral });
    } catch (err) {
      if (err.code !== 10008) { // Ignore Unknown Message error
        console.error(err);
      }
    }
  }
};

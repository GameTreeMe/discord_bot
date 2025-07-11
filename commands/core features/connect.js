const { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { User } = require('../../models/user');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('connect')
    .setDescription('Link your Discord account to your GameTree account')
    .addStringOption(opt =>
      opt
        .setName('username')
        .setDescription('Your GameTree username (case-sensitive)')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName('email')
        .setDescription('Your GameTree email address')
        .setRequired(true)
    ),

  async execute(interaction) {
    // Make replies visible only to the invoking user
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const username   = interaction.options.getString('username', true);
    const providedEmail = interaction.options.getString('email', true);

    // Look up the GameTree user by username
    const user = await User.findOne({ username });
    if (!user) {
      return interaction.editReply({
        content: `❌ Could not find a GameTree account with username \`${username}\`. Please double-check the spelling (it is case-sensitive).`,
        flags: MessageFlags.Ephemeral
      });
    }

    // Compare stored email to the one they provided
    if (user.email !== providedEmail) {
      return interaction.editReply({
        content: `❌ The email you provided does not match the GameTree account for \`${username}\`. Please check your email address.`,
        flags: MessageFlags.Ephemeral
      });
    }

    // Email matches → link their Discord account
    if (user.discordId && user.discordUsername) {
      // If already linked, ask for confirmation to update using buttons
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('confirm_update')
          .setLabel('✅ Yes, update')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('cancel_update')
          .setLabel('❌ No, cancel')
          .setStyle(ButtonStyle.Danger)
      );
      await interaction.editReply({
        content: `⚠️ This GameTree user is already linked to Discord account <@${user.discordId}> (username: ${user.discordUsername}).\n\nDo you want to update the link to your current Discord account?`,
        components: [row],
        flags: MessageFlags.Ephemeral
      });

      // Wait for button interaction
      try {
        const buttonInteraction = await interaction.channel.awaitMessageComponent({
          filter: i => i.user.id === interaction.user.id && ['confirm_update', 'cancel_update'].includes(i.customId),
          time: 30000,
          componentType: ComponentType.Button
        });
        if (buttonInteraction.customId === 'confirm_update') {
          user.discordId = interaction.user.id;
          user.discordUsername = interaction.user.tag;
          user.discordDisplayName = interaction.member?.displayName || interaction.user.displayName || interaction.user.username;
          await user.save();
          await buttonInteraction.update({
            content: `✅ Updated! Your Discord account <@${interaction.user.id}> is now linked to GameTree user \`${username}\`.`,
            components: [],
            flags: MessageFlags.Ephemeral
          });
        } else {
          await buttonInteraction.update({
            content: '❌ Update cancelled. Your Discord account was not changed.',
            components: [],
            flags: MessageFlags.Ephemeral
          });
        }
      } catch (e) {
        await interaction.editReply({
          content: '❌ No response received. Update cancelled.',
          components: [],
          flags: MessageFlags.Ephemeral
        });
      }
      return;
    }

    // If not already linked, proceed as before
    user.discordId = interaction.user.id;
    user.discordUsername = interaction.user.tag;
    user.discordDisplayName = interaction.member?.displayName || interaction.user.displayName || interaction.user.username;
    user.lfgInviteOptIn = true; // Default to opt-in for LFG invites
    await user.save();

    return interaction.editReply({
      content: `✅ Success! Your Discord account <@${interaction.user.id}> is now linked to GameTree user \`${username}\`. You can now use LFG features and receive invites. To update your opt in/out status for LFG invites, use the \`/opt\` command.`,
      flags: MessageFlags.Ephemeral
    });
  }
};
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds] 
});

const BADGE_ROLE_MAPPING = {
    'L1': '1410210518534197321', // Votre ID de rôle
};

const GUILD_ID = process.env.DISCORD_GUILD_ID;
const app = express();
app.use(express.json());

// Webhook pour recevoir les notifications
app.post('/webhook/badge-obtained', async (req, res) => {
    try {
        const { discord_username, badges } = req.body;
        console.log(`Webhook reçu pour ${discord_username} avec badges:`, badges);
        
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) return res.status(404).json({ error: 'Serveur non trouvé' });
        
        // Chercher le membre par username
        const members = guild.members.cache;
        const member = members.find(m => m.user.tag === discord_username);
        
        if (!member) {
            console.log(`Membre non trouvé: ${discord_username}`);
            return res.status(404).json({ error: 'Membre non trouvé' });
        }
        
        // Ajouter les rôles
        for (const badge of badges) {
            const roleId = BADGE_ROLE_MAPPING[badge];
            if (roleId) {
                const role = guild.roles.cache.get(roleId);
                if (role && !member.roles.cache.has(roleId)) {
                    await member.roles.add(role);
                    console.log(`Rôle ${role.name} ajouté à ${member.user.tag}`);
                }
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Erreur webhook:', error);
        res.status(500).json({ error: error.message });
    }
});

// Commandes slash
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    
    if (interaction.commandName === 'link-account') {
        const code = interaction.options.getString('code');
        
        try {
            // Appeler votre API pour vérifier le code
            const response = await fetch('https://lorcanajudge.com/api/discord_integration.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'verify_discord_with_code',
                    verification_code: code,
                    discord_id: interaction.user.id,
                    discord_username: interaction.user.tag
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                await interaction.reply({
                    content: 'Compte lié avec succès ! Vos rôles seront automatiquement synchronisés.',
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: 'Code invalide ou expiré.',
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Erreur commande link-account:', error);
            await interaction.reply({
                content: 'Une erreur est survenue.',
                ephemeral: true
            });
        }
    }
});

client.once('ready', async () => {
    console.log(`Bot connecté: ${client.user.tag}`);
    
    // Enregistrer les commandes slash
    const commands = [
        new SlashCommandBuilder()
            .setName('link-account')
            .setDescription('Lier votre compte Discord au site web')
            .addStringOption(option =>
                option.setName('code')
                    .setDescription('Code de vérification du site')
                    .setRequired(true))
    ];
    
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    
    try {
        console.log('Enregistrement des commandes...');
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, GUILD_ID),
            { body: commands }
        );
        console.log('Commandes slash enregistrées');
    } catch (error) {
        console.error('Erreur lors de l\'enregistrement des commandes:', error);
    }
});

client.login(process.env.DISCORD_TOKEN);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});

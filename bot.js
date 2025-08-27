const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] 
});

const BADGE_ROLE_MAPPING = {
    'L1': '1410210518534197321', // Votre ID de rôle L1 Judge
};

const GUILD_ID = process.env.DISCORD_GUILD_ID;
const app = express();
app.use(express.json());

// Webhook pour recevoir les notifications de badges
app.post('/webhook/badge-obtained', async (req, res) => {
    try {
        const { discord_username, badges } = req.body;
        
        console.log(`Webhook reçu pour ${discord_username} avec badges:`, badges);
        
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) return res.status(404).json({ error: 'Serveur non trouvé' });
        
        // Chercher le membre par username
        const members = await guild.members.fetch();
        const member = members.find(m => m.user.tag === discord_username);
        
        if (!member) {
            console.log(`Membre non trouvé: ${discord_username}`);
            return res.status(404).json({ error: 'Membre non trouvé' });
        }
        
        // Ajouter les rôles correspondant aux badges
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

client.once('ready', async () => {
    console.log(`Bot connecté: ${client.user.tag}`);
    
    // Créer la commande slash
    const commands = [
        new SlashCommandBuilder()
            .setName('test')
            .setDescription('Test du bot')
    ];
    
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    
    try {
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, GUILD_ID),
            { body: commands }
        );
        console.log('Commandes enregistrées');
    } catch (error) {
        console.error('Erreur commandes:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    
    if (interaction.commandName === 'test') {
        await interaction.reply('Bot fonctionne !');
    }
});

client.login(process.env.DISCORD_TOKEN);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});

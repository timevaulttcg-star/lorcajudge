const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');

console.log('=== Démarrage du bot Discord LorcaJudge ===');
console.log('DISCORD_TOKEN présent:', !!process.env.DISCORD_TOKEN);
console.log('DISCORD_GUILD_ID:', process.env.DISCORD_GUILD_ID);

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers
    ] 
});

const BADGE_ROLE_MAPPING = {
    'L1': '1410210518534197321'
};

const GUILD_ID = process.env.DISCORD_GUILD_ID;
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        status: 'LorcaJudge Discord Bot is running',
        bot_connected: client.isReady(),
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        bot_status: client.isReady() ? 'connected' : 'disconnected',
        guild_connected: client.guilds.cache.has(GUILD_ID),
        uptime: process.uptime()
    });
});

app.post('/webhook/badge-obtained', async (req, res) => {
    try {
        const { discord_id, badges } = req.body;
        console.log(`[WEBHOOK] Sync badges pour ${discord_id}: ${badges}`);
        
        if (!client.isReady()) {
            return res.status(503).json({ error: 'Bot déconnecté' });
        }
        
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) {
            return res.status(404).json({ error: 'Serveur non trouvé' });
        }
        
        const member = await guild.members.fetch(discord_id).catch(() => null);
        if (!member) {
            return res.status(404).json({ error: 'Membre non trouvé' });
        }
        
        // Synchroniser les rôles
        for (const badge of badges) {
            const roleId = BADGE_ROLE_MAPPING[badge];
            if (roleId && guild.roles.cache.has(roleId)) {
                if (!member.roles.cache.has(roleId)) {
                    await member.roles.add(roleId);
                    console.log(`[WEBHOOK] Rôle ${badge} ajouté`);
                }
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('[WEBHOOK] Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    
    if (interaction.commandName === 'link-account') {
        const code = interaction.options.getString('code');
        
        try {
            const response = await fetch('https://lorcanajudge.com/api/discord_integration.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'verify_discord_with_code',
                    verification_code: code,
                    discord_id: interaction.user.id,
                    discord_username: interaction.user.username
                })
            });
            
            const result = await response.json();
            
            await interaction.reply({
                content: result.success ? 
                    '🎉 Compte lié avec succès !' : 
                    '❌ Code invalide ou expiré.',
                ephemeral: true
            });
        } catch (error) {
            await interaction.reply({
                content: '⚠️ Erreur technique.',
                ephemeral: true
            });
        }
    }
});

client.once('ready', async () => {
    console.log(`[DISCORD] ✅ Bot connecté: ${client.user.tag}`);
    
    const guild = client.guilds.cache.get(GUILD_ID);
    if (guild) {
        console.log(`[DISCORD] ✅ Serveur: ${guild.name} (${guild.memberCount} membres)`);
        await guild.members.fetch();
    } else {
        console.error(`[DISCORD] ❌ Serveur non trouvé: ${GUILD_ID}`);
        return;
    }
    
    const commands = [
        new SlashCommandBuilder()
            .setName('link-account')
            .setDescription('Lier votre compte Discord')
            .addStringOption(option =>
                option.setName('code')
                    .setDescription('Code de vérification')
                    .setRequired(true))
    ];
    
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    await rest.put(
        Routes.applicationGuildCommands(client.user.id, GUILD_ID),
        { body: commands }
    );
    
    console.log('[DISCORD] ✅ Commandes enregistrées');
});

client.on('error', console.error);

client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('[DISCORD] ❌ Connexion échouée:', error);
    process.exit(1);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[EXPRESS] Serveur sur port ${PORT}`);
});

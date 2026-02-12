// server.js - WITH NEWS SOURCES MANAGEMENT
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const Parser = require('rss-parser');
const { MongoClient } = require('mongodb');

const app = express();
const parser = new Parser();

app.use(cors());
app.use(express.json());

// Initialize Anthropic
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// MongoDB connection
let db;
MongoClient.connect(process.env.MONGODB_URL).then(client => {
  db = client.db('newsaggregator');
  console.log('✓ Connected to database');
  
  // Initialize default sources if none exist
  initializeDefaultSources();
}).catch(error => {
  console.error('MongoDB connection error:', error);
  process.exit(1);
});

// Initialize default news sources
async function initializeDefaultSources() {
  const count = await db.collection('sources').countDocuments();
  
  if (count === 0) {
    const defaultSources = [
      { id: generateId(), name: 'Reuters', url: 'https://feeds.reuters.com/reuters/topNews', category: 'general', enabled: true, createdAt: new Date() },
      { id: generateId(), name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'technology', enabled: true, createdAt: new Date() },
      { id: generateId(), name: 'BBC News', url: 'http://feeds.bbci.co.uk/news/rss.xml', category: 'general', enabled: true, createdAt: new Date() },
      { id: generateId(), name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: 'technology', enabled: true, createdAt: new Date() },
      { id: generateId(), name: 'Ars Technica', url: 'http://feeds.arstechnica.com/arstechnica/index', category: 'technology', enabled: true, createdAt: new Date() },
    ];
    
    await db.collection('sources').insertMany(defaultSources);
    console.log('✓ Initialized default news sources');
  }
}

// ============================================
// NEWS SOURCES API ENDPOINTS
// ============================================

// Get all news sources
app.get('/api/sources', async (req, res) => {
  try {
    const sources = await db.collection('sources').find().toArray();
    res.json(sources);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new news source
app.post('/api/sources', async (req, res) => {
  try {
    const { name, url, category } = req.body;
    
    if (!name || !url) {
      return res.status(400).json({ error: 'Name and URL are required' });
    }
    
    // Validate URL is an RSS feed by trying to parse it
    try {
      await parser.parseURL(url);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid RSS feed URL' });
    }
    
    const source = {
      id: generateId(),
      name,
      url,
      category: category || 'general',
      enabled: true,
      createdAt: new Date()
    };
    
    await db.collection('sources').insertOne(source);
    res.status(201).json(source);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update news source (toggle enabled, edit name, etc)
app.put('/api/sources/:id', async (req, res) => {
  try {
    const { name, url, category, enabled } = req.body;
    const updateData = {};
    
    if (name !== undefined) updateData.name = name;
    if (url !== undefined) updateData.url = url;
    if (category !== undefined) updateData.category = category;
    if (enabled !== undefined) updateData.enabled = enabled;
    
    const result = await db.collection('sources').updateOne(
      { id: req.params.id },
      { $set: updateData }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Source not found' });
    }
    
    const updatedSource = await db.collection('sources').findOne({ id: req.params.id });
    res.json(updatedSource);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete news source
app.delete('/api/sources/:id', async (req, res) => {
  try {
    const result = await db.collection('sources').deleteOne({ id: req.params.id });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Source not found' });
    }
    
    res.json({ message: 'Source deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ARTICLES API ENDPOINTS
// ============================================

// Get all articles
app.get('/api/articles', async (req, res) => {
  try {
    const { topicId, limit = 50 } = req.query;
    
    const filter = topicId ? { topicId } : {};
    
    const articles = await db.collection('articles')
      .find(filter)
      .sort({ publishedAt: -1 })
      .limit(parseInt(limit))
      .toArray();
    
    res.json(articles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single article
app.get('/api/articles/:id', async (req, res) => {
  try {
    const article = await db.collection('articles').findOne({ id: req.params.id });
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    res.json(article);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// TOPICS API ENDPOINTS
// ============================================

// Get topics
app.get('/api/topics', async (req, res) => {
  try {
    const { userId } = req.query;
    const filter = userId ? { userId } : {};
    
    const topics = await db.collection('topics').find(filter).toArray();
    res.json(topics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create topic
app.post('/api/topics', async (req, res) => {
  try {
    const { name, keywords, userId } = req.body;
    
    if (!name || !keywords || keywords.length === 0) {
      return res.status(400).json({ error: 'Name and keywords are required' });
    }
    
    const topic = {
      id: generateId(),
      name,
      keywords,
      userId: userId || 'default',
      createdAt: new Date(),
    };
    
    await db.collection('topics').insertOne(topic);
    res.status(201).json(topic);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete topic
app.delete('/api/topics/:id', async (req, res) => {
  try {
    const result = await db.collection('topics').deleteOne({ id: req.params.id });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Topic not found' });
    }
    
    res.json({ message: 'Topic deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// NEWS FETCHING
// ============================================

// Manually trigger news fetch
app.post('/api/fetch-news', async (req, res) => {
  try {
    console.log('\n📰 Fetching news from sources...');
    
    // Get enabled sources from database
    const sources = await db.collection('sources').find({ enabled: true }).toArray();
    
    if (sources.length === 0) {
      return res.status(400).json({ error: 'No enabled sources found' });
    }
    
    const allArticles = [];
    
    // Fetch from each enabled RSS feed
    for (const source of sources) {
      try {
        console.log(`  Fetching from ${source.name}...`);
        const feed = await parser.parseURL(source.url);
        
        const articles = feed.items.slice(0, 5).map(item => ({
          sourceId: generateId(),
          sourceName: source.name,
          sourceUrl: item.link,
          title: cleanTitle(item.title),
          content: cleanContent(item.contentSnippet || item.summary || ''),
          publishedAt: new Date(item.pubDate || Date.now()),
        }));
        
        allArticles.push(...articles);
        console.log(`  ✓ Got ${articles.length} articles`);
      } catch (error) {
        console.log(`  ✗ Error from ${source.name}: ${error.message}`);
      }
    }
    
    console.log(`\n📊 Total articles fetched: ${allArticles.length}`);
    console.log('🔄 Grouping similar articles...');
    
    // Simple deduplication
    const groups = [];
    const used = new Set();
    
    for (let i = 0; i < allArticles.length; i++) {
      if (used.has(i)) continue;
      
      const group = [allArticles[i]];
      used.add(i);
      
      for (let j = i + 1; j < allArticles.length; j++) {
        if (used.has(j)) continue;
        
        const words1 = allArticles[i].title.toLowerCase().split(/\s+/);
        const words2 = allArticles[j].title.toLowerCase().split(/\s+/);
        const common = words1.filter(w => w.length > 3 && words2.includes(w)).length;
        
        if (common >= 3) {
          group.push(allArticles[j]);
          used.add(j);
        }
      }
      
      groups.push(group);
    }
    
    console.log(`✓ Grouped into ${groups.length} unique stories`);
    console.log('\n🤖 Generating comprehensive articles with Claude AI...');
    
    let savedCount = 0;
    const groupsToProcess = groups.slice(0, 15);
    
    for (let i = 0; i < groupsToProcess.length; i++) {
      const group = groupsToProcess[i];
      
      try {
        console.log(`\n  [${i + 1}/${groupsToProcess.length}] Processing: ${group[0].title.substring(0, 60)}...`);
        
        const sourcesText = group.map((article, index) => {
          return `SOURCE ${index + 1} [${article.sourceName}]:
Title: ${article.title}
Content: ${article.content}
URL: ${article.sourceUrl}
`;
        }).join('\n---\n\n');
        
        const prompt = `You are a professional news editor. Create a comprehensive news article from these sources:

${sourcesText}

Provide exactly this format:

HEADLINE:
[Write a compelling one-line headline]

SUMMARY:
[Write 2-3 sentences summarizing the key points]

ARTICLE:
[Write a comprehensive article that includes all unique facts from all sources. Use inline citations like [1], [2], [3] when referencing specific sources. Write in clear, professional news style.]`;

        const message = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: prompt
          }]
        });
        
        const response = message.content[0].text;
        
        const headlineMatch = response.match(/HEADLINE:\s*(.+?)(?:\n|$)/i);
        const summaryMatch = response.match(/SUMMARY:\s*(.+?)(?=\n\nARTICLE:|\n\n[A-Z]+:|$)/is);
        const articleMatch = response.match(/ARTICLE:\s*(.+)/is);
        
        const headline = headlineMatch ? headlineMatch[1].trim() : group[0].title;
        const summary = summaryMatch ? summaryMatch[1].trim().replace(/\n/g, ' ') : '';
        let generatedContent = articleMatch ? articleMatch[1].trim() : response;
        
        const sourcesSection = '\n\n---\n\nSOURCES:\n' + 
          group.map((article, index) => 
            `[${index + 1}] ${article.sourceName} - ${article.sourceUrl}`
          ).join('\n');
        
        generatedContent += sourcesSection;
        
        const article = {
          id: generateId(),
          headline,
          summary,
          generatedContent,
          sources: group.map(a => ({
            id: a.sourceId,
            name: a.sourceName,
            url: a.sourceUrl,
            fetchedAt: new Date()
          })),
          publishedAt: group[0].publishedAt,
          createdAt: new Date(),
        };
        

 const existing = await db.collection('articles').findOne({
  $or: [
    { headline: { $regex: new RegExp(headline.substring(0, 30), 'i') } },
    { headline: headline }
  ],
  createdAt: { $gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
});
        
        if (!existing) {
          await db.collection('articles').insertOne(article);
          console.log(`  ✓ Saved: ${headline.substring(0, 80)}...`);
          savedCount++;
        } else {
          console.log(`  ⊘ Duplicate skipped`);
        }
        
        if (i < groupsToProcess.length - 1) {
          await sleep(2000);
        }
        
      } catch (error) {
        console.log(`  ✗ Error: ${error.message}`);
      }
    }
    
    console.log(`\n✅ Complete! Saved ${savedCount} new articles`);
    console.log(`💰 Approximate cost: $${(savedCount * 0.003).toFixed(3)}\n`);
    
    res.json({ 
      success: true, 
      articlesProcessed: savedCount,
      totalFetched: allArticles.length,
      totalGroups: groups.length,
      estimatedCost: (savedCount * 0.003).toFixed(3)
    });
    
  } catch (error) {
    console.error('❌ Error fetching news:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clear all articles (for testing)
app.delete('/api/articles/clear', async (req, res) => {
  try {
    const result = await db.collection('articles').deleteMany({});
    res.json({ message: 'Articles cleared', deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date(),
    database: db ? 'connected' : 'disconnected',
  });
});

// Stats
app.get('/api/stats', async (req, res) => {
  try {
    const totalArticles = await db.collection('articles').countDocuments();
    const totalTopics = await db.collection('topics').countDocuments();
    const totalSources = await db.collection('sources').countDocuments();
    const enabledSources = await db.collection('sources').countDocuments({ enabled: true });
    
    res.json({
      totalArticles,
      totalTopics,
      totalSources,
      enabledSources,
      lastCheck: new Date(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function cleanTitle(title) {
  return title
    .replace(/\s*-\s*[A-Z][a-z]+(\s+[A-Z][a-z]+)*\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanContent(content) {
  return content
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 500);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;

// Cleanup old articles (older than 3 days)
app.delete('/api/articles/cleanup', async (req, res) => {
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const result = await db.collection('articles').deleteMany({
      createdAt: { $lt: threeDaysAgo }
    });
    res.json({ message: 'Old articles cleaned up', deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log('\n========================================');
  console.log('🚀 News Aggregator Server Running');
  console.log('========================================');
  console.log(`📡 API: http://localhost:${PORT}/api`);
  console.log(`💊 Health: http://localhost:${PORT}/health`);
  console.log('========================================\n');
});

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down server...');
  console.log('✓ Goodbye!\n');
  process.exit(0);
});

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
          imageUrl: item.enclosure?.url || item.media?.thumbnail?.url || item.image?.url || null, // Extract image from RSS
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
        
// Pick the best image from sources (prioritize first source with image)
let imageUrl = group.find(a => a.imageUrl)?.imageUrl;

// Fallback: use Unsplash if no RSS image found
if (!imageUrl) {
  const keywords = headline.split(' ').slice(0, 3).join(',');
  imageUrl = `https://picsum.photos/800/600?random=${Date.now()}`;
}

          const article = {
          id: generateId(),
          headline,
          summary,
          generatedContent,
          imageUrl,
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

// Web view for shared articles
app.get('/article/:id', async (req, res) => {
  try {
    const article = await db.collection('articles').findOne({ id: req.params.id });
    
    if (!article) {
      return res.status(404).send('<h1>Article not found</h1>');
    }
    
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${article.headline}</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 700px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
            color: #333;
        }
        h1 { 
            font-size: 28px;
            margin-bottom: 10px;
        }
        .meta {
            color: #666;
            font-size: 14px;
            margin-bottom: 20px;
        }
        .summary {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .content {
            white-space: pre-wrap;
            margin-bottom: 30px;
        }
        .sources {
            border-top: 2px solid #eee;
            padding-top: 20px;
        }
        .source {
            margin-bottom: 10px;
        }
        .source a {
            color: #007AFF;
            text-decoration: none;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            color: #666;
        }
    </style>
</head>
<body>
    <h1>${article.headline}</h1>
    <div class="meta">
        ${new Date(article.publishedAt).toLocaleDateString()} • ${article.sources.length} sources
    </div>
    
    <div class="summary">
        <strong>Summary:</strong> ${article.summary}
    </div>
    
    <div class="content">${article.generatedContent}</div>
    
    <div class="sources">
        <h3>Sources</h3>
        ${article.sources.map((source, i) => `
            <div class="source">
                [${i + 1}] <a href="${source.url}" target="_blank">${source.name}</a>
            </div>
        `).join('')}
    </div>
    
    <div class="footer">
        Powered by NewsAggregator
    </div>
</body>
</html>
    `;
    
    res.send(html);
  } catch (error) {
    res.status(500).send('<h1>Error loading article</h1>');
  }
});

// Initialize preloaded sources (call once on first app launch)
app.post('/api/sources/initialize-preloaded', async (req, res) => {
  try {
    // Check if preloaded sources already exist (by checking for a specific one)
const techCrunchExists = await db.collection('sources').findOne({ name: "TechCrunch" });
if (techCrunchExists) {
  const totalCount = await db.collection('sources').countDocuments();
  return res.json({ message: 'Preloaded sources already added', count: totalCount });
}
    
    // Preloaded sources data
    const preloadedSources = [
      // Technology
      { name: "TechCrunch", url: "https://techcrunch.com/feed/", category: "technology", enabled: false },
      { name: "The Verge", url: "https://www.theverge.com/rss/index.xml", category: "technology", enabled: false },
      { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", category: "technology", enabled: false },
      { name: "Wired", url: "https://www.wired.com/feed/rss", category: "technology", enabled: false },
      { name: "Engadget", url: "https://www.engadget.com/rss.xml", category: "technology", enabled: false },
      { name: "CNET", url: "https://www.cnet.com/rss/news/", category: "technology", enabled: false },
      { name: "ZDNet", url: "https://www.zdnet.com/news/rss.xml", category: "technology", enabled: false },
      { name: "Gizmodo", url: "https://gizmodo.com/rss", category: "technology", enabled: false },
      { name: "Lifehacker", url: "https://lifehacker.com/rss", category: "technology", enabled: false },
      { name: "MIT Technology Review", url: "https://www.technologyreview.com/feed/", category: "technology", enabled: false },
      { name: "VentureBeat", url: "https://venturebeat.com/feed/", category: "technology", enabled: false },
      { name: "Mashable", url: "https://mashable.com/feeds/rss/all", category: "technology", enabled: false },
      { name: "TNW", url: "https://thenextweb.com/feed/", category: "technology", enabled: false },
      { name: "Digital Trends", url: "https://www.digitaltrends.com/feed/", category: "technology", enabled: false },
      { name: "Tom's Hardware", url: "https://www.tomshardware.com/feeds/all", category: "technology", enabled: false },
      { name: "AnandTech", url: "https://www.anandtech.com/rss/", category: "technology", enabled: false },
      { name: "9to5Mac", url: "https://9to5mac.com/feed/", category: "technology", enabled: false },
      { name: "MacRumors", url: "https://www.macrumors.com/feed/", category: "technology", enabled: false },
      { name: "Android Authority", url: "https://www.androidauthority.com/feed/", category: "technology", enabled: false },
      { name: "XDA Developers", url: "https://www.xda-developers.com/feed/", category: "technology", enabled: false },
      
      // General News
      { name: "BBC News", url: "https://feeds.bbci.co.uk/news/rss.xml", category: "general", enabled: false },
      { name: "NPR News", url: "https://feeds.npr.org/1001/rss.xml", category: "general", enabled: false },
      { name: "The Guardian", url: "https://www.theguardian.com/world/rss", category: "general", enabled: false },
      { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", category: "general", enabled: false },
      { name: "PBS NewsHour", url: "https://www.pbs.org/newshour/feeds/rss/headlines", category: "general", enabled: false },
      { name: "TIME", url: "https://time.com/feed/", category: "general", enabled: false },
      { name: "Newsweek", url: "https://www.newsweek.com/rss", category: "general", enabled: false },
      { name: "The Independent", url: "https://www.independent.co.uk/rss", category: "general", enabled: false },
      { name: "ABC News", url: "https://abcnews.go.com/abcnews/topstories", category: "general", enabled: false },
      { name: "CBS News", url: "https://www.cbsnews.com/latest/rss/main", category: "general", enabled: false },
      { name: "NBC News", url: "https://feeds.nbcnews.com/nbcnews/public/news", category: "general", enabled: false },
      { name: "Axios", url: "https://api.axios.com/feed/", category: "general", enabled: false },
      { name: "Vice News", url: "https://www.vice.com/en/rss", category: "general", enabled: false },
      { name: "Vox", url: "https://www.vox.com/rss/index.xml", category: "general", enabled: false },
      { name: "ProPublica", url: "https://www.propublica.org/feeds/propublica/main", category: "general", enabled: false },
      
      // Politics
      { name: "Politico", url: "https://www.politico.com/rss/politics08.xml", category: "politics", enabled: false },
      { name: "The Hill", url: "https://thehill.com/feed/", category: "politics", enabled: false },
      { name: "RealClearPolitics", url: "https://www.realclearpolitics.com/index.xml", category: "politics", enabled: false },
      { name: "FiveThirtyEight", url: "https://fivethirtyeight.com/feed/", category: "politics", enabled: false },
      { name: "Roll Call", url: "https://www.rollcall.com/news/feed", category: "politics", enabled: false },
      
      // Sports
      { name: "ESPN", url: "https://www.espn.com/espn/rss/news", category: "sports", enabled: false },
      { name: "Sports Illustrated", url: "https://www.si.com/rss/si_topstories.rss", category: "sports", enabled: false },
      { name: "Bleacher Report", url: "https://bleacherreport.com/articles/feed", category: "sports", enabled: false },
      { name: "Yahoo Sports", url: "https://sports.yahoo.com/rss/", category: "sports", enabled: false },
      { name: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/rss.xml", category: "sports", enabled: false },
      
      // Business
      { name: "Bloomberg", url: "https://feeds.bloomberg.com/markets/news.rss", category: "business", enabled: false },
      { name: "CNBC", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", category: "business", enabled: false },
      { name: "MarketWatch", url: "https://feeds.marketwatch.com/marketwatch/topstories/", category: "business", enabled: false },
      { name: "Business Insider", url: "https://www.businessinsider.com/rss", category: "business", enabled: false },
      { name: "Forbes", url: "https://www.forbes.com/real-time/feed2/", category: "business", enabled: false },
      
      // Science
      { name: "Science Daily", url: "https://www.sciencedaily.com/rss/all.xml", category: "science", enabled: false },
      { name: "Phys.org", url: "https://phys.org/rss-feed/", category: "science", enabled: false },
      { name: "Scientific American", url: "https://www.scientificamerican.com/feed/", category: "science", enabled: false },
      { name: "Space.com", url: "https://www.space.com/feeds/all", category: "science", enabled: false },
      
      // Entertainment
      { name: "Variety", url: "https://variety.com/feed/", category: "entertainment", enabled: false },
      { name: "The Hollywood Reporter", url: "https://www.hollywoodreporter.com/feed/", category: "entertainment", enabled: false },
      { name: "Rolling Stone", url: "https://www.rollingstone.com/feed/", category: "entertainment", enabled: false }
    ];
    
    // Add createdAt to each source
    const sourcesWithDates = preloadedSources.map(source => ({
      ...source,
      id: generateId(),
      createdAt: new Date()
    }));
    
    const result = await db.collection('sources').insertMany(sourcesWithDates);
    
    res.json({ 
      message: 'Preloaded sources initialized successfully',
      count: result.insertedCount 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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


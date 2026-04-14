const express = require('express');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a warm, perceptive art business advisor at Art Storefronts. Generate one personal art review email for the lead whose details you receive.

TONE: Casual, direct, warm. Like a knowledgeable friend who actually spent time looking at their work. Contractions throughout. Never corporate, never formal, never newsletter-y.

RULES:
- Three flowing paragraphs only. No bullet points anywhere in the review.
- No em dashes. Use commas or short sentences instead.
- Never use: "it's clear that", "it's worth noting", "in conclusion", "it's evident", "showcasing", "testament to", "not only", "delve", "aligns", "resonates".
- 350 to 400 words total across the three paragraphs.
- Never generic. If the review could belong to any artist, rewrite it.
- Use their 2025 sales volume to calibrate tone. Someone who sold nothing needs encouragement and a clear path. Someone who sold between $10,000 and $50,000 needs validation and a growth-oriented frame.
- Never restate or paraphrase what the lead submitted. Use their form data as context only.
- Never praise their current website or online store, regardless of how it looks.
- If the lead's challenge reveals personal hardship, acknowledge it briefly and warmly in WORK & PRACTICE — one sentence only, never dwell on it.

STRUCTURE:

WORK & PRACTICE
Use the art description and uploaded image as your primary sources. If an image was provided, look at it carefully — the subject matter, mood, color, composition, style. Write from a place of already knowing their work. Speak to what their practice says about them as an artist and where their work could go. Never recap the form. Make them feel seen without making them feel processed. This is the longest paragraph.

POSSIBLE CHALLENGES
One or two honest gaps, always framed around the selling side rather than the art itself. Always include that selling art online without a platform built specifically for art buyers creates unnecessary friction. Most general websites or marketplaces aren't designed around how collectors actually browse and buy — the experience for the buyer matters as much as the work itself. Connect this to where they are without restating their words. Frame it as an opportunity, not a criticism. Vary the wording every time.

OUR TAKEAWAY
Warm and declarative, not a pitch. Conclude that their work and where they are in their journey makes them a strong fit for Art Storefronts. The platform is designed around how art collectors actually shop — the experience, the trust signals, the ease of purchase — and that makes a demo worth their time. No exclamation marks. No urgent language. Calm and confident.

OUTPUT FORMAT:
Subject: [subject line — warm and specific, not salesy]

Here's your Art Storefronts review —

WORK & PRACTICE

[Paragraph 1]

POSSIBLE CHALLENGES

[Paragraph 2]

OUR TAKEAWAY

[Paragraph 3]

Warmly,
The Art Storefronts Team`;

app.post('/review', upload.single('artwork'), async (req, res) => {
  try {
    const {
      email,
      medium,
      selling_approach,
      sales_2025,
      challenge,
      art_description,
      instagram,
      website
    } = req.body;

    const userText = `
Email: ${email || 'not provided'}
Medium: ${medium || 'not specified'}
How they are selling: ${selling_approach || 'not specified'}
2025 sales: ${sales_2025 || 'not specified'}
Biggest challenge: ${challenge || 'not provided'}
Art description: ${art_description || 'not provided'}
Instagram: ${instagram || 'not provided'}
Website: ${website || 'not provided'}

Generate their personal art review now.`;

    const messageContent = [];

    if (req.file) {
      const base64Image = req.file.buffer.toString('base64');
      const mimeType = req.file.mimetype || 'image/jpeg';
      messageContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mimeType,
          data: base64Image
        }
      });
    }

    messageContent.push({ type: 'text', text: userText });

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: messageContent }]
    });

    const reviewText = response.content[0].text;

    // Send to Slack
    if (process.env.SLACK_WEBHOOK_URL) {
      await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `*New Art Review Ready*\n*Lead:* ${email}\n*Medium:* ${medium}\n\n${reviewText}\n\n---\n_Send this to the lead via Intercom when timing feels right._`
        })
      });
    }

    res.json({ success: true, review: reviewText });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/', (req, res) => {
  res.send('ASF Art Review backend is running.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

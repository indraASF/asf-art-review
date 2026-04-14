const express = require('express');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
    const body = req.body;
    console.log('Tally payload:', JSON.stringify(body));

    // Parse Tally's nested field structure
    const fields = {};
    if (body.data && body.data.fields) {
      body.data.fields.forEach(field => {
        fields[field.key] = field.value;
        fields[field.label] = field.value;
      });
    }

    const email = fields['question_LGkDWv'] || fields['What\'s your Email address?'] || body.email || 'not provided';
    const name = fields['question_pAveBJ'] || fields['What\'s your preferred name?'] || body.name || '';
    const medium = Array.isArray(fields['question_1K6W7p'])
      ? fields['question_1K6W7p'].map(v => typeof v === 'object' ? v.text || v : v).join(', ')
      : fields['What medium do you work in?'] || body.medium || 'not specified';
    const selling_approach = Array.isArray(fields['question_M0m1zM'])
      ? fields['question_M0m1zM'].map(v => typeof v === 'object' ? v.text || v : v).join(', ')
      : fields['How are you currently approaching selling your art?'] || body.selling_approach || 'not specified';
    const sales_2025 = typeof fields['question_JRM1Ao'] === 'object'
      ? fields['question_JRM1Ao'].text || JSON.stringify(fields['question_JRM1Ao'])
      : fields['question_JRM1Ao'] || fields['How much art did you sell in 2025?'] || body.sales_2025 || 'not specified';
    const challenge = fields['question_gAvbMO'] || fields['What\'s your number one art business challenge right now?'] || body.challenge || 'not provided';
    const art_description = fields['question_yyzX9g'] || fields['Describe your work in a few sentences'] || body.art_description || 'not provided';
    const instagram = fields['question_XGz5Wg'] || fields['Your Instagram handle'] || body.instagram || 'not provided';
    const website = fields['question_8kMNQ5'] || fields['Link to where we can view your art'] || body.website || 'not provided';

    const displayName = name || email.split('@')[0];

    // Handle image from Tally file upload
    let imageData = null;
    let imageMimeType = 'image/jpeg';
    const fileField = fields['question_0MaV6y'] || fields['Upload an image of your work'];
    if (fileField && Array.isArray(fileField) && fileField.length > 0) {
      const fileInfo = fileField[0];
      if (fileInfo.url) {
        try {
          const imageResponse = await fetch(fileInfo.url);
          const imageBuffer = await imageResponse.buffer();
          imageData = imageBuffer.toString('base64');
          imageMimeType = fileInfo.mimeType || 'image/jpeg';
        } catch (e) {
          console.log('Could not fetch image:', e.message);
        }
      }
    }

    // Build message content
    const messageContent = [];

    if (imageData) {
      messageContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: imageMimeType,
          data: imageData
        }
      });
    } else if (req.file) {
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

    const userText = `
Email: ${email}
Name: ${displayName}
Medium: ${medium}
How they are selling: ${selling_approach}
2025 sales: ${sales_2025}
Biggest challenge: ${challenge}
Art description: ${art_description}
Instagram: ${instagram}
Website: ${website}

Generate their personal art review now.`;

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
          text: `*New Art Review Ready*\n*Lead:* ${email}\n*Name:* ${displayName}\n*Medium:* ${medium}\n\n${reviewText}\n\n---\n_Send this to the lead via Intercom when timing feels right._`
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

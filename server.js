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

function resolveField(value, options) {
  const optionMap = {};
  if (options && Array.isArray(options)) {
    options.forEach(opt => {
      if (opt.id && opt.text) optionMap[opt.id] = opt.text;
    });
  }

  if (!value) return null;

  if (typeof value === 'string') {
    return optionMap[value] || value;
  }

  if (Array.isArray(value)) {
    return value.map(item => {
      if (typeof item === 'string') return optionMap[item] || item;
      if (typeof item === 'object' && item !== null) {
        return item.text || optionMap[item.id] || item.value || JSON.stringify(item);
      }
      return String(item);
    }).join(', ');
  }

  if (typeof value === 'object') {
    return value.text || optionMap[value.id] || value.value || JSON.stringify(value);
  }

  return String(value);
}

app.post('/review', upload.single('artwork'), async (req, res) => {
  try {
    const body = req.body;
    console.log('Tally payload:', JSON.stringify(body));
    // Ignore non-form-response events
if (body.eventType !== 'FORM_RESPONSE') {
  console.log('Ignoring non-form-response event:', body.eventType);
  return res.json({ success: true, message: 'Ignored' });
}

    const fieldMap = {};
    if (body.data && body.data.fields) {
      body.data.fields.forEach(field => {
        fieldMap[field.key] = { value: field.value, options: field.options };
      });
    }

    const email = resolveField(fieldMap['question_LGkDWv']?.value) || 'not provided';
    const name = resolveField(fieldMap['question_pAveBJ']?.value) || '';
    const medium = resolveField(fieldMap['question_1K6W7p']?.value, fieldMap['question_1K6W7p']?.options) || 'not specified';
    const selling_approach = resolveField(fieldMap['question_M0m1zM']?.value, fieldMap['question_M0m1zM']?.options) || 'not specified';
    const sales_2025 = resolveField(fieldMap['question_JRM1Ao']?.value, fieldMap['question_JRM1Ao']?.options) || 'not specified';
    const challenge = resolveField(fieldMap['question_gAvbMO']?.value) || 'not provided';
    const art_description = resolveField(fieldMap['question_yyzX9g']?.value) || 'not provided';
    const instagram = resolveField(fieldMap['question_XGz5Wg']?.value) || 'not provided';
    const website = resolveField(fieldMap['question_8kMNQ5']?.value) || 'not provided';

    const displayName = name || email.split('@')[0];

    console.log('Parsed fields:', { email, name: displayName, medium, selling_approach, sales_2025, challenge, art_description, instagram, website });

    let imageData = null;
    let imageMimeType = 'image/jpeg';
    const fileField = fieldMap['question_0MaV6y']?.value;
    if (fileField && Array.isArray(fileField) && fileField.length > 0) {
      const fileInfo = fileField[0];
      if (fileInfo.url) {
        try {
          const imageResponse = await fetch(fileInfo.url);
          const imageBuffer = await imageResponse.buffer();
          imageData = imageBuffer.toString('base64');
          imageMimeType = fileInfo.mimeType || 'image/jpeg';
          console.log('Image fetched successfully');
        } catch (e) {
          console.log('Could not fetch image:', e.message);
        }
      }
    }

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

    console.log('User text sent to Claude:', userText);
    messageContent.push({ type: 'text', text: userText });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: messageContent }]
    });

    const reviewText = response.content[0].text;

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

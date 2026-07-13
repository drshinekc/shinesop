// Takes a completed user's profile + raw Q&A answers and asks Claude to
// organize them into the same structured format as the brand's personal
// SOP template: narrative paragraphs, bullet lists, and comparison tables,
// grouped under section-appropriate subheadings. Returns JSON only.
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const body = JSON.parse(event.body);
    const { profile, commitment, sectionsWithAnswers } = body;
    // sectionsWithAnswers: [{ label, questions: [...], answers: [...] }, ...]

    const transcript = sectionsWithAnswers.map((s, i) =>
      `SECTION ${i + 1}: ${s.label}\n${s.answers.join('\n')}`
    ).join('\n\n---\n\n');

    const systemPrompt = `You are organizing someone's completed Shine SOP (Soul Operating Protocol) answers into a polished, structured document. This mirrors an editorial process: read their raw answers for each section and sort them into the same kind of structure a thoughtful editor would use — narrative paragraphs, bullet lists, and comparison tables — depending on what the content actually is. Do NOT invent facts, categories, or details that are not clearly present in their answers. Use their own words and voice (first person) as much as possible, lightly condensed for readability, never fabricated or exaggerated.

For each of the 7 sections (My Patterns, Who I Am, My Needs, My Boundaries, My Intentions, Knowing Myself, My Life Vision), produce a list of "blocks" in reading order. Each block is one of:
- {"type": "h2", "text": "Subheading"}
- {"type": "para", "text": "Flowing narrative paragraph in first person."}
- {"type": "labelval", "label": "Short label", "value": "Value text"}
- {"type": "quote", "text": "A real, specific moment or line worth pulling out as a callout."}
- {"type": "bullets", "items": ["item 1", "item 2", "..."]}
- {"type": "table", "headers": ["Col1", "Col2"], "rows": [["...", "..."], ["...", "..."]]}

Guidance per section (use only what's actually present in their answers — skip any that doesn't apply):
- My Patterns: a short "The Pattern" narrative, a "Triggers" table (Trigger / What it looks like / Where it likely comes from) if there's enough material, "Recurring Patterns I Want to Break" bullets, "What I've Already Improved" bullets, "Patterns I Want to Carry Forward" bullets, and a quote of a real specific memory if one exists.
- Who I Am: values as bullets, "How I Give Love" bullets, "How I Receive Love Best" bullets, "What Quietly Drains Me" bullets, "What Lights Me Up" bullets, any real specific examples as quotes.
- My Needs: a "Non-Negotiable Needs" table (Need / Why it matters), "Needs I've Historically Minimized" bullets, quotes for anything specific and real.
- My Boundaries: a "Boundaries I Know I Need to Hold" table (Boundary / What crossing it looks like / How I want to respond), a "Boundaries I Have Broken in the Past" table if applicable, bullets for what they need when struggling to hold one.
- My Intentions: "What I Want to Experience" and "What I Want to Offer" as paragraphs, a "Fears I Am Carrying In" table (Fear / Old or new? / What would help me feel safer), a closing quote if a clear commitment line exists.
- Knowing Myself: plain narrative paragraphs only (no bullets or tables) — money, creative life, rest, body, spirituality, whatever they actually discussed.
- My Life Vision: narrative paragraphs on what they're building, what they want more of (can be bullets), what they're ready to let go of, and a closing quote if a strong closing line exists.

Return ONLY valid JSON, no markdown fences, no commentary, in this exact shape:
{"sections": [{"title": "My Patterns", "desc": "One-sentence framing for this section, in the SOP's own voice.", "blocks": [...]}, ...]}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 8000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Profile: ${JSON.stringify(profile)}\nCommitment: "${commitment}"\n\n${transcript}\n\nOrganize this into the JSON structure described.`,
          },
        ],
      }),
    });

    const data = await response.json();
    const raw = data.content?.[0]?.text || '';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not parse report JSON', raw }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

// netlify/functions/generate-itinerary.js
//
// Real AI itinerary generation for TsakuFly.
// Calls the Claude API server-side (API key never reaches the browser)
// and returns a day-by-day plan as JSON.
//
// Required Netlify environment variable: ANTHROPIC_API_KEY

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { destination, country, days, style } = payload;
  const dayCount = Math.max(1, Math.min(14, parseInt(days, 10) || 5));

  if (!destination || !country) {
    return { statusCode: 400, body: JSON.stringify({ error: "destination and country are required" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured on the server" }),
    };
  }

  const styleLabel = style <= 0.6 ? "ბიუჯეტური (დაბალბიუჯეტიანი)" : style >= 1.6 ? "ლუქს" : "კომფორტული, საშუალო ბიუჯეტი";

  const prompt = `შენ ხარ გამოცდილი მოგზაურობის კონსიერჟი. შექმენი ${dayCount}-დღიანი, დღითი-დღე მარშრუტი ${destination}-სთვის (${country}), მოგზაურობის სტილი: ${styleLabel}.

დააბრუნე მხოლოდ სუფთა JSON (არანაირი ახსნა-განმარტება, არანაირი მარკდაუნის ბლოკი \`\`\` ), ზუსტად ამ სტრუქტურით:

{
  "days": [
    { "day": 1, "morning": "კონკრეტული აქტივობა/ღირსშესანიშნაობა", "afternoon": "...", "evening": "..." }
  ]
}

წესები:
- ${dayCount} ჩანაწერი "days" მასივში, ზუსტად თანმიმდევრობით 1-დან ${dayCount}-მდე.
- ყოველი აქტივობა იყოს კონკრეტული და რეალური (რეალური ღირსშესანიშნაობის/რესტორნის ტიპის/უბნის სახელი), არა ზოგადი ფრაზა.
- აქტივობები არ უნდა მეორდებოდეს დღეების მიხედვით — თითოეული დღე განსხვავებული უნდა იყოს.
- ტექსტი ქართულ ენაზე, თითოეული ველი მაქსიმუმ 12 სიტყვა.
- გაითვალისწინე მოგზაურობის სტილი (ბიუჯეტური/კომფორტული/ლუქსი) აქტივობების შერჩევისას.`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return {
        statusCode: 502,
        body: JSON.stringify({ error: "AI request failed", detail: errText }),
      };
    }

    const data = await resp.json();
    const text = (data.content && data.content[0] && data.content[0].text) || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { statusCode: 502, body: JSON.stringify({ error: "Could not parse AI response", raw: text }) };
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      return { statusCode: 502, body: JSON.stringify({ error: "Invalid JSON from AI", raw: jsonMatch[0] }) };
    }

    if (!parsed.days || !Array.isArray(parsed.days) || parsed.days.length === 0) {
      return { statusCode: 502, body: JSON.stringify({ error: "AI response missing days array" }) };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

import express from "express";
import cors from "cors";
import multer from "multer";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Upload handling – używamy pamięci
const upload = multer({ storage: multer.memoryStorage() });

// Klient OpenAI
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Health check
app.get("/", (req, res) => {
  res.send("UPLashes backend działa");
});

// GŁÓWNY ENDPOINT ANALIZY
app.post("/analyze", upload.single("image"), async (req, res) => {
  try {
    // sprawdzenie pliku
    if (!req.file) {
      return res.status(400).json({ error: "Nie przesłano pliku." });
    }

    // parametry z frontendu
    const { language, analysisType } = req.body; // language: "pl" | "en", analysisType: "before" | "after"

    const lang = language === "en" ? "en" : "pl";
    const type = analysisType === "after" ? "after" : "before";

    // Teksty promptu PL/EN
    const systemPromptPl = `
Jesteś bardzo doświadczoną instruktorką stylizacji rzęs oraz edukatorem.
Analizujesz zdjęcia oka / stylizacji rzęs i dajesz jasny, konkretny i profesjonalny feedback.
Mówisz jak ekspert, ale prosto – tak, aby stylistka od razu wiedziała, co poprawić w kolejnej pracy.
`;

    const systemPromptEn = `
You are a highly experienced lash stylist and educator.
You analyze lash photos and give clear, professional feedback.
You speak like an expert, but in simple, direct language so the lash artist immediately knows what to improve next time.
`;

    const requestedAnalysisLabelPl =
      type === "before"
        ? "PRZED aplikacją – dobór stylizacji (długości, skrętu, efektu, gęstości)."
        : "PO aplikacji – analiza wykonanej pracy (plusy, błędy, wskazówki do poprawy).";

    const requestedAnalysisLabelEn =
      type === "before"
        ? "BEFORE application – planning the style (lengths, curls, effect, density)."
        : "AFTER application – analysis of the finished work (strengths, mistakes, tips for improvement).";

    const userPromptPl = `
Analizujemy zbliżeniowe zdjęcie oka / stylizacji rzęs.

WAŻNE PARAMETRY:
- język odpowiedzi: polski
- oczekiwany typ analizy: ${requestedAnalysisLabelPl}

KROK 1 – Ustal etap na podstawie zdjęcia:
- jeśli na zdjęciu nie ma jeszcze pełnej aplikacji (naturalne rzęsy, brak gęstej stylizacji, może być mapping, rzęsy odżywione/nieprzedłużone) – potraktuj to jako ANALIZA PRZED APLIKACJĄ.
- jeśli na zdjęciu widać gotową stylizację (rzęsy przedłużone, widoczny efekt objętości/1:1, wyraźny kształt linii) – potraktuj to jako ANALIZA PO APLIKACJI.

KROK 2 – Jeśli ODBIERZESZ zdjęcie jako:
- PRZED APLIKACJĄ:
  Opisz:
  1) jaki efekt i kształt linii zaproponowałabyś (np. delikatne uniesienie, eyeliner, dolly, fox itp.),
  2) sugerowane skręty (C, CC, D itd.) i długości (przykładowe zakresy, np. 7–12 mm),
  3) gęstość / objętość (1:1, 2–3D, mega volume – w jakich strefach więcej/mniej),
  4) szczególne uwagi do budowy oka (opadająca powieka, głęboko osadzone, szeroko rozstawione itp.).

- PO APLIKACJI:
  Przeanalizuj:
  1) GĘSTOŚĆ I OBJĘTOŚĆ – czy są dziury, zbyt gęste strefy, brak balansu.
  2) KIERUNKI – czy rzęsy idą w jednym kierunku, czy są „krzyżyki”, rzęsy odchodzące w dół lub na boki.
  3) DOPASOWANIE DŁUGOŚCI I KSZTAŁTU – czy długości są dobrane do oka, czy nie przeciążają naturalnych rzęs.
  4) LINIA I PRZEJŚCIA – czy przejścia długości są płynne, czy nie ma nagłych przeskoków.
  5) CZYSTOŚĆ APLIKACJI – sklejki, zbyt grube wiązania, brudna linia, odstające rzęsy.
  6) PLUSY – co wyszło naprawdę dobrze i warto to pochwalić.
  7) KONKRETNE WSKAZÓWKI – co dokładnie poprawić w kolejnej pracy (np. zmienić długości w zewnętrznym kąciku, dopracować kierunki w strefie 8–10 mm, zmniejszyć ilość kleju itd.).

KROK 3 – DOPASUJ odpowiedź do oczekiwanego typu analizy (${requestedAnalysisLabelPl}),
ale zawsze na początku jednym zdaniem napisz, czy Twoim zdaniem zdjęcie przedstawia etap raczej PRZED czy raczej PO aplikacji.

Forma odpowiedzi:
- mów po polsku,
- używaj krótkich sekcji z nagłówkami (np. "Gęstość i objętość", "Kierunki", "Propozycja stylizacji"),
- bądź szczera, ale wspierająca – jak dobry instruktor.
`;

    const userPromptEn = `
We are analyzing a close-up eye photo for lash styling.

IMPORTANT SETTINGS:
- answer language: English
- expected analysis type: ${requestedAnalysisLabelEn}

STEP 1 – Detect the stage based on the image:
- if the eye looks mostly natural (no full lash set yet, maybe just mapping, no heavy extensions) – treat it as BEFORE APPLICATION.
- if there is a finished lash set (clearly visible extensions, volume or classic set, visible lash line shape) – treat it as AFTER APPLICATION.

STEP 2 – If you interpret the photo as:
- BEFORE APPLICATION:
  Describe:
  1) what overall effect and lash line shape you would recommend (e.g. soft lift, eyeliner, dolly, fox, etc.),
  2) suggested curls (C, CC, D, etc.) and example length ranges (e.g. 7–12 mm),
  3) density/volume (classic, 2–3D, mega volume – where more/less),
  4) any special notes about the eye shape (hooded, deep-set, wide-set, etc.).

- AFTER APPLICATION:
  Analyze:
  1) DENSITY & VOLUME – any gaps, too dense areas, lack of balance.
  2) DIRECTION – are the lashes aligned, or are there crossed lashes, downward or sideways lashes.
  3) LENGTH & SHAPE – are the lengths appropriate for the eye, not overloading natural lashes.
  4) LINE & TRANSITIONS – are length transitions smooth or too abrupt.
  5) CLEANLINESS – stickies, bulky bases, messy lash line, lashes sticking out.
  6) STRENGTHS – what is done really well and should be praised.
  7) CONCRETE TIPS – what exactly to improve next time (e.g. adjust lengths in outer corner, refine directions in mid-zone, use less adhesive, etc.).

STEP 3 – ALIGN the answer with the expected analysis type (${requestedAnalysisLabelEn}),
but always start with one sentence saying whether you think the photo is more likely BEFORE or AFTER application.

Answer format:
- answer in English,
- use short sections with headings (e.g. "Density & Volume", "Directions", "Style Proposal"),
- be honest but supportive – like a good instructor.
`;

    const finalSystemPrompt = lang === "en" ? systemPromptEn : systemPromptPl;
    const finalUserPrompt = lang === "en" ? userPromptEn : userPromptPl;

    // Konwersja obrazka na base64
    const base64Image = req.file.buffer.toString("base64");

    // Wywołanie OpenAI Responses API
    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: finalSystemPrompt,
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: finalUserPrompt,
            },
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${base64Image}`,
            },
          ],
        },
      ],
    });

    const aiAnswer =
      response.output?.[0]?.content?.[0]?.text ||
      response.output_text ||
      "Brak odpowiedzi od modelu.";

    // Zwracamy wynik w polu "analysis" (frontend tego oczekuje)
    res.json({
      analysis: aiAnswer,
      result: aiAnswer, // dodatkowo zostawiam też "result" na wszelki wypadek
    });
  } catch (error) {
    console.error("SERVER ERROR:", error);
    res.status(500).json({
      error: "Błąd analizy AI.",
      details: error.message,
    });
  }
});

// Port dla Render
const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log("Backend UPLashes działa na porcie " + port);
});

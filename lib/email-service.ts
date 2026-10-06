import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import { UserProfile, DEFAULT_PROFILE } from './types';

export const SHAMA_PROFILE_CONTEXT = `
Candidate Name: Dr. Shama Abidi
Current Role: Senior Clinical Pharmacist at Liaquat National Hospital & Medical College, Karachi, Pakistan (since August 2007)
Leadership: Vice President, Pakistan Pharmacist Association (PPA), Sindh Cabinet (Appointed 2023)
Education:
- MPhil in Pharmacy Practice, Faculty of Pharmacy & Pharmaceutical Sciences, University of Karachi (Completed Nov 2024). Thesis: "Effectiveness and Safety Assessment of Calcium Channel Blockers Compared to Beta Blockers in Patients with Angina" (Supervisor: Dr. Saira Saeed Khan)
- Doctor of Pharmacy (PharmD), Federal Urdu University of Arts, Sciences & Technology (2019)
- Bachelor of Pharmacy (B-Pharm), University of Karachi (2007)

Key Clinical & Research Expertise:
- Tertiary care hospital clinical pharmacy, ICU/HDU ward rounds, therapeutic drug monitoring, renal and hepatic dose adjustments.
- Lead clinical pharmacist in Antimicrobial Stewardship Program (ASP) since 2018; evaluated carbapenem use, de-escalation, culture & sensitivity (C/S) concordance, and clinical outcomes.
- Medication safety, high-alert medications (HAM), and adverse drug reaction (ADR) causality assessment using the Naranjo scale.
- Health services implementation research, cross-sectional surveys, prospective interventional clinical studies.
- Artificial intelligence & digital health in clinical pharmacy decision support (evaluating LLMs/ChatGPT in clinical medication therapy management).

Key Peer-Reviewed Publications & Presentations:
1. Abidi S, Saeed Khan S, Naeem S, Siddiqui H, Khadim S, Saleem S, et al. (2024). "Effectiveness and safety assessment of calcium channel blockers compared to beta blockers in patients with angina: An observational study." Pakistan Journal of Pharmaceutical Sciences, 37(3):639-649.
2. Ali F, Zehra T, Solangi NA, Makki KU, Siddiqui HA, Abidi S. (2022). "Evaluation of carbapenem antimicrobial stewardship program at a tertiary care hospital: A prospective interventional study." Pakistan Journal of Pharmaceutical Sciences, 35(6):1595-1601.
3. Baig F, Siddiqui HA, Bilekhia A, Abidi S, Ahmed S. (2025). "AI meets human expertise: Comparison between clinical pharmacist interventions and artificial intelligence at a tertiary care hospital in Pakistan." Journal of Pharmaceutical Policy and Practice / FIP, 18(Suppl 2):2485639.
4. Baig F, Bilekhia A, Abidi S, Ahmed S. (2025). "Evaluating knowledge of high-alert medications among nurses, pharmacists, and clinicians to improve medication safety." Journal of Pharmaceutical Policy and Practice, 18(Suppl 2):2485639.
5. Abidi S. (2026). "Exploring the landscape of evidence based pharmacy practice in Pakistan: Insights into knowledge, attitudes and implementation barriers." FIP Montreal 2026, World Congress of Pharmacy and Pharmaceutical Sciences.

PhD Objective:
Seeking a fully-funded international PhD position aligned with clinical pharmacy, antimicrobial stewardship, medication safety, pharmacy practice implementation science, or digital/AI health in hospital pharmacy.
`;

export async function generatePersonalizedEmail(
  profName: string,
  university: string,
  researchArea: string,
  recentPaper: string,
  profile: Partial<UserProfile> = {},
  type: 'first' | 'followup' = 'first'
): Promise<{ subject: string; body: string }> {
  const senderName = profile.name || DEFAULT_PROFILE.name;
  const background = profile.background || DEFAULT_PROFILE.background;
  const researchInterests = profile.researchInterests || DEFAULT_PROFILE.researchInterests;
  const publications = profile.publications || DEFAULT_PROFILE.publications;

  const systemPrompt =
    type === 'first'
      ? `You are an assistant helping Dr. Shama Abidi, an experienced clinical pharmacist and MPhil researcher from Pakistan, write a highly tailored, authentic, and concise inquiry email to an academic professor regarding fully-funded PhD opportunities in their research group.

Guidelines:
- Maximum 130-160 words for the body.
- Be concise, direct, and intellectually grounded.
- Mention the professor's recent paper: "${recentPaper}" and specifically connect it to Shama's clinical research experience (e.g. her hospital antimicrobial stewardship trials, cardiovascular observational study, or medication safety work).
- Clearly state she holds an MPhil in Pharmacy Practice and 17 years tertiary hospital experience, seeking a fully-funded PhD opening.
- Inquire respectfully about whether they are accepting funded PhD students for upcoming intakes.
- NEVER use generic flattery clichés (e.g. "I hope this email finds you well", "I was blown away by your illustrious work", "world-renowned expert").
- Do NOT include greeting (salutation) or sign-off/signature in the BODY, as the system appends them automatically. Return only the core body paragraphs.
- Return format:
SUBJECT: [compelling, specific subject line]
BODY:
[body paragraphs]`
      : `You are helping Dr. Shama Abidi write a polite, concise follow-up email (max 80-100 words body) regarding a previous PhD inquiry to Professor ${profName} at ${university}.
Acknowledge professors are exceptionally busy, briefly reaffirm strong interest in PhD opportunities in ${researchArea}, and ask if they had an opportunity to review her profile. No clichés, no salutation, no sign-off.
Return format:
SUBJECT: Re: PhD Research Inquiry – ${university}
BODY:
[body paragraphs]`;

  const userPrompt = `Professor: ${profName}
University: ${university}
Research Area: ${researchArea}
Recent Paper: "${recentPaper}"

Candidate Profile:
${SHAMA_PROFILE_CONTEXT}
Additional Background: ${background}
Research Interests: ${researchInterests}
Selected Publications: ${publications}

Write the email subject and body.`;

  // 1. Try Groq first for ultra-fast generation (< 500ms)
  try {
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      const groq = new Groq({ apiKey: groqKey });
      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        model: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
        max_tokens: 450,
        temperature: 0.7,
      });
      const text = completion.choices[0]?.message?.content ?? '';
      if (text && text.trim().length > 20) {
        return parseEmailOutput(text, university, profName);
      }
    }
  } catch (err) {
    console.warn('Groq email generation failed, trying Gemini:', err);
  }

  // 2. Fallback to Gemini
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    const candidateModels = [
      process.env.GEMINI_MODEL,
      'gemini-flash-latest',
      'gemini-2.5-flash-lite',
      'gemini-3.8-flash',
    ].filter(Boolean) as string[];

    const genAI = new GoogleGenerativeAI(geminiApiKey);

    for (const m of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({ model: m });
        const result = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
        const text = result.response.text();
        if (text && text.trim().length > 20) {
          return parseEmailOutput(text, university, profName);
        }
      } catch (err) {
        console.warn(`Gemini model ${m} failed:`, err);
      }
    }
  }

  // Safe template fallback if both APIs fail
  if (type === 'followup') {
    return {
      subject: `Following up: PhD Research Inquiry – ${researchArea || university}`,
      body: `I hope this email finds you well. I am writing to gently follow up on my previous message regarding prospective fully-funded PhD opportunities in your research group at ${university}.\n\nGiven my 17+ years of experience as a Senior Clinical Pharmacist and my active research in ${researchArea}, I remain very interested in the possibility of doctoral study under your supervision.\n\nI understand you receive many inquiries and have a very full schedule, but I would be deeply grateful to know if you might have upcoming doctoral openings. I have attached my CV for your convenience.`,
    };
  }

  return {
    subject: `PhD Research Inquiry – ${researchArea || university}`,
    body: `I am writing to respectfully inquire about fully-funded PhD opportunities within your research group at ${university}. I have been following your scholarly work, particularly your publication "${recentPaper}", which strongly connects with my research experience in ${researchArea}.\n\nI hold an MPhil in Pharmacy Practice from the University of Karachi and have served as a Senior Clinical Pharmacist at Liaquat National Hospital for over 17 years, leading antimicrobial stewardship and medication safety initiatives with multiple peer-reviewed publications.\n\nCould you please let me know if you are currently considering prospective PhD candidates for upcoming fully-funded openings? I would be honored to discuss how my research background aligns with your ongoing projects.`,
  };
}

function parseEmailOutput(
  text: string,
  university: string,
  profName: string
): { subject: string; body: string } {
  const subjectMatch = text.match(/SUBJECT:\s*(.+)/i);
  const bodyMatch = text.match(/BODY:\s*([\s\S]+)/i);

  const subject =
    subjectMatch?.[1]?.trim() ??
    `PhD Inquiry: Clinical Pharmacy & Practice – ${university}`;

  let body = bodyMatch?.[1]?.trim() ?? text.replace(/SUBJECT:.+/i, '').replace(/BODY:/i, '').trim();

  // Strip accidental salutations or signatures from the AI body
  body = body.replace(/^(Dear|Hello|Hi)\s+[^,\n]+,\s*/i, '');
  body = body.replace(/^(Professor|Prof\.|Dr\.)\s+[^,\n]+,?\s*/i, '');
  body = body.replace(/\n\s*(Sincerely|Best regards|Kind regards|Warm regards|Regards)[\s\S]*$/i, '').trim();

  return { subject, body };
}

export function constructFullEmailMessage(
  bodyContent: string,
  profName: string,
  profile: Partial<UserProfile> = {}
): string {
  const senderName = profile.name || DEFAULT_PROFILE.name;
  const senderEmail = profile.email || DEFAULT_PROFILE.email;
  const cleanName = profName.replace(/^Dr\.\s*|^Prof\.\s*/i, '').trim();
  const lastName = cleanName.split(' ').slice(-1)[0];

  return `Dear Dr. ${lastName},

${bodyContent}

I have attached my academic CV for your kind consideration.

Kind regards,
${senderName}
Senior Clinical Pharmacist | MPhil Pharmacy Practice
Liaquat National Hospital, Karachi, Pakistan
Email: ${senderEmail}
ORCID: 0009-0008-3714-1675
LinkedIn: https://www.linkedin.com/in/shama-abidi-5a41a0304/`;
}

/**
 * Appends a personalized PhD inquiry draft directly into Shama's Gmail [Gmail]/Drafts folder via IMAP.
 * This guarantees the draft is immediately visible in her actual Gmail inbox drafts as well as in the CRM.
 */
export async function syncDraftToGmail(
  toEmail: string,
  subject: string,
  body: string
): Promise<{ success: boolean; uid?: number; error?: string }> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    return { success: false, error: 'Gmail credentials not configured' };
  }

  try {
    const { ImapFlow } = await import('imapflow');
    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: { user, pass },
      logger: false,
    });

    await client.connect();

    const cleanSubject = subject.replace(/[\r\n]+/g, ' ').trim();

    // Compile complete MIME message including CV attachment
    const { getCvAttachment } = await import('@/lib/cv-asset');
    const nodemailer = (await import('nodemailer')).default || (await import('nodemailer'));
    const cvAttachment = getCvAttachment();

    const compiler = nodemailer.createTransport({ streamTransport: true, buffer: true });
    const info: any = await compiler.sendMail({
      from: `"Dr. Shama Abidi" <${user}>`,
      to: toEmail,
      subject: cleanSubject,
      text: body,
      attachments: [cvAttachment],
    });

    const compiledBuffer: Buffer = info.message;

    const res = await client.append('[Gmail]/Drafts', compiledBuffer, ['\\Draft', '\\Seen']);
    await client.logout();
    const uid = res && typeof res === 'object' && 'uid' in res ? (res as any).uid : undefined;
    return { success: Boolean(res), uid };
  } catch (err: any) {
    console.warn('Failed to append draft to Gmail:', err);
    return { success: false, error: err?.message || 'Failed to sync draft to Gmail' };
  }
}


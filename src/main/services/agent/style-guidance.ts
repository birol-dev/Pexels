const STYLE_GUIDANCE: Record<string, string> = {
  cinematic:
    'Favor wide establishing shots, slow motion, dramatic light (golden hour, night, silhouettes), and shallow depth of field.',
  documentary:
    'Favor real places and people at work, handheld shots, and natural light. Avoid staged studio shots.',
  business:
    'Favor offices, meetings, laptops, charts, and city buildings. Clean, bright, and modern.',
  tech: 'Favor screens, code, circuit boards, data centers, neon light, and modern interiors.',
  nature:
    'Favor landscapes, wildlife, plants, water, and weather. Avoid city scenes unless the beat needs one.',
  lifestyle: 'Favor candid everyday moments at home, in cafes, and outdoors, in natural light.',
  abstract: 'Favor textures, light leaks, particles, patterns, macro shots, and ink in water.'
}

/** The style picker sends this when the custom style box is left empty. */
const EMPTY_CUSTOM_STYLE = 'custom style'

/** One line telling the model what the chosen style changes. Custom styles pass through as written. */
export function describeVisualStyle(style: string): string {
  const text = style.replace(/\s+/g, ' ').trim()
  if (!text || text === EMPTY_CUSTOM_STYLE) return ''
  // A custom style is the user's own text, so it can be any word, including "constructor".
  if (Object.hasOwn(STYLE_GUIDANCE, text)) return STYLE_GUIDANCE[text]
  return `The user describes the style as: "${text.slice(0, 200)}".`
}

/** The style as the prompts print it: its name, then what it changes when there is something to say. */
export function visualStyleLine(style: string): string {
  const guidance = describeVisualStyle(style)
  return guidance ? `${style}. ${guidance}` : style
}

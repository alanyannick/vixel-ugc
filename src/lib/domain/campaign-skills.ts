import { z } from "zod";

export const CampaignSkillIdSchema = z.enum([
  "product-review",
  "problem-demo",
  "founder-story",
  "faceless-explainer",
]);

export type CampaignSkillId = z.infer<typeof CampaignSkillIdSchema>;

export const DEFAULT_CAMPAIGN_SKILL_ID: CampaignSkillId = "product-review";

export type CampaignSkill = {
  id: CampaignSkillId;
  label: string;
  description: string;
  direction: string;
};

export const CAMPAIGN_SKILLS: readonly CampaignSkill[] = [
  {
    id: "product-review",
    label: "Product Review",
    description: "Creator-led, evidence-first evaluation.",
    direction:
      "Use a creator-led review that shows supplied evidence before sharing an impression.",
  },
  {
    id: "problem-demo",
    label: "Problem → Demo",
    description: "Recognizable friction followed by one visible action.",
    direction:
      "Open with a recognizable audience problem, then demonstrate one observable product action without inventing an outcome.",
  },
  {
    id: "founder-story",
    label: "Founder Story",
    description: "Product decisions explained in a founder voice.",
    direction:
      "Frame supplied facts as product decisions in a founder voice, but never invent an origin story, motivation, or company claim.",
  },
  {
    id: "faceless-explainer",
    label: "Faceless Explainer",
    description: "Hands, product, captions, and voiceover carry the story.",
    direction:
      "Build a faceless explainer with hands, product, screen detail, captions, or voiceover; do not require an on-camera creator.",
  },
] as const;

export function getCampaignSkill(id: CampaignSkillId): CampaignSkill {
  return (
    CAMPAIGN_SKILLS.find((skill) => skill.id === id) ?? CAMPAIGN_SKILLS[0]
  );
}

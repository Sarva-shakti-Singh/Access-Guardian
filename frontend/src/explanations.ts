import type { Finding } from "./types";

const EXPLANATIONS: Record<string, string> = {
  "image-alt": "Screen-reader users may not know what this image represents because it has no text alternative.",
  "input-image-alt": "This image-based control may not announce its purpose to screen-reader users.",
  "role-img-alt": "This graphic is identified as an image, but it does not provide a text alternative.",
  "svg-img-alt": "This SVG is identified as an image, but it does not provide a text alternative.",
  "button-name": "People using a screen reader may not understand what this button does.",
  "input-button-name": "People using a screen reader may not understand the purpose of this control.",
  "link-name": "People using a screen reader may not know where this link goes.",
  label: "People may not know what information to enter because this form control has no clear label.",
  "select-name": "People using a screen reader may not know what this dropdown is for.",
  "aria-input-field-name": "This input does not have a name that assistive technology can announce.",
  "color-contrast": "Some people may find this text difficult to read because it may not stand out enough from its background.",
  "document-title": "A useful page title helps people understand which page is open.",
  "html-has-lang": "Screen readers use the page language to pronounce text correctly.",
  "heading-order": "A clear heading order helps people understand and navigate the page structure.",
  region: "Landmarks help people using assistive technology find the main parts of a page.",
  "landmark-one-main": "A main landmark helps people jump directly to the primary content.",
  "aria-required-attr": "This accessible widget may be missing information assistive technology needs to describe it.",
  "aria-valid-attr": "An invalid accessibility attribute may be ignored by assistive technology.",
};

export function friendlyExplanation(finding: Finding): string {
  return EXPLANATIONS[finding.rule_id] ??
    "This element may be harder for some people to understand or use. Review the rule details and test the change with assistive technology.";
}

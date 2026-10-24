# Website direction

Built-in ImageGen supplied three separate references before implementation: hero, product/install, documentation. References are retained locally under ignored release/design/. Final text-free hero artwork is assets/hero-paper.png. The website uses live HTML text and the real app screenshots, rather than generated interface text.

## Reference extraction

Hero: warm paper-white ground, near-black grotesk display type, electric blue paper mark. Open left text column, paper-stack artwork anchored right; generous top margin, three-line heading, black rectangular CTA and an underlined secondary guide link. The paper shadows supply depth; no panel enclosure. Implemented with a 5% gutter, 83px maximum heading and 660px desktop hero; laptop heading scales down and mobile moves the paper below the copy.

Product: giant left-aligned headline, blue second line, actual wide app capture with a single restrained shadow, then three flat text columns separated by hairline rules. Install block shifts to pale blue and uses one dark code surface. The reference's invented app interface and URL were replaced with actual screenshots and the real GitHub installer.

Docs: slim left sidebar, open readable article, serif display heading, plain sans-serif body, dark terminal blocks and hairline section dividers. Implemented as a sticky 230px sidebar and bounded reading column, with horizontal navigation on mobile. Unsupported future-platform promises and invented version commands from the reference were omitted.

Signature elements: paper stack, off-grid oversized heading, single product frame, vertical rhythm lines. Motion: restrained float-up on CTA hover and native smooth anchor navigation, disabled for reduced-motion preference.

## Prompt set

1. Standalone ArchJet hero: paper white, black grotesk type, blue accent, left headline/CTA, realistic paper stack exiting a black printer slot at right, no cards or fake stats.
2. Standalone product/install: same palette, wide printer-app preview, three flat feature columns, pale blue install strip with dark terminal.
3. Standalone documentation: same palette, left text navigation, open reading column, large heading, install code and thin rules.
4. Edit hero: remove all text, logos, controls and labels while preserving the paper stack, blue stripe, texture, shadows and blank left space for live HTML.

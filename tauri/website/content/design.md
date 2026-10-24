# Website direction

## Current direction
The website belongs to the same visual family as the desktop app. The user rejected the previous blue palette and decorative paper-stack image, and explicitly asked for a different route. Production now uses the app's own printer icon and actual workspace captures. There is no decorative hero photograph or generated interface text.

Light tokens follow the app: paper #f7f7f4, ink #292b2a, forest green #345f4c. Dark uses #171c19, #e4ebe1 and sage #b4c4ae. Borders, code blocks, links, illustration sheets and installation surfaces use the same warm green family. Light / Dark / System persists across all pages; matching screenshots follow the resolved preference. The document inside the actual app screenshot retains its original colours, as it does in the app.

## Reference extraction
Three fresh standalone ImageGen references were generated and inspected before implementation. Local copies: release/design/green-hero-reference.png, green-workflow-reference.png and green-install-reference.png. These are design references only, not website downloads.

Hero: asymmetrical 43/57 split, three-line grotesk headline “Your pages. Your order. Your call.” with the final line in italic serif and forest green. A restrained green CTA, one text action and a single real app capture on a slightly angled sage backing. All headline text remains live HTML. Roughly 60px top/bottom spacing, 5vw gutters and a bounded 1440px canvas. The workspace has a keyboard-accessible enlarged preview with native dialog focus management and Escape dismissal. No decorative browser chrome, fake stats or nested marketing cards.

Workflow: an open two-column heading with the explanation aligned opposite, followed by a flat sage surface with All / Odd / Custom example controls and a six-sheet sequence. The visible numbers reproduce the actual exact-order syntax, including repeated pages. This is an illustrative website interaction and never opens files or prints. Two plain benefit columns below explain local conversion and CUPS, separated by a rule. The generated plants/photo textures were omitted so the illustration can remain sharp, lightweight and theme-aware in HTML/CSS.

Install: a full-width muted surface, editorial headline left and a simple matching terminal right. The public installer command remains exact and copyable. Runtime requirements link directly to the guide. Footer is one open row with the real app icon and a quiet serif line.

Documentation: same palette, sticky header, bounded reading column, serif section headings, active page navigation, collapsible outline on mobile and previous/next page links. All code surfaces and inline code follow the current theme. Code blocks have copy buttons. Documentation source remains Markdown and generated pages remain static HTML.

## Delivery and motion
Actual app captures are lossless WebP: light 40,164 bytes, dark 37,040 bytes. The chosen hero screenshot receives high fetch priority and explicit dimensions. Theme resolution runs before styles, and the initial screenshot source is assigned only afterward. Other images load lazily. The local DM Sans font avoids external font requests. Old decorative hero WebPs were removed.

Hover motion is limited to controls and the illustrative sheets. Reduced-motion preferences disable these effects and smooth scrolling. No scrolling interception, video, animation framework or additional frontend dependency is used.

## Prompt record
- Hero reference: warm ivory, app forest/sage palette, no blue, spacious asymmetric software hero, actual supplied app screenshot on the right, three-line Your pages / Your order / Your call headline and an italic final line, simple CTA, no decorative hero image.
- Workflow reference: same palette, Not every page / Just your pages heading, All/Odd/Custom controls, visible sequence 1,5,2,3,4,1, flat benefit columns, no fake statistics.
- Install reference: same palette, Make room for a better print headline, real curl installer in a light terminal, runtime requirement link and minimal footer.

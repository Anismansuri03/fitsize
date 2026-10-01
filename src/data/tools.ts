import type { IconName } from './icons';

export type Category = 'organize' | 'convert' | 'edit' | 'secure';

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'organize', label: 'Organize' },
  { id: 'convert', label: 'Convert' },
  { id: 'edit', label: 'Edit' },
  { id: 'secure', label: 'Protect' },
];

export interface Tool {
  slug: string;
  name: string;
  navLabel: string;
  icon: IconName;
  category: Category;
  short: string;
  lead?: boolean;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  lede: string;
  steps: { title: string; text: string }[];
  faq: { q: string; a: string }[];
}

export const tools: Tool[] = [
  {
    slug: 'compress-pdf', name: 'Compress PDF', navLabel: 'Compress PDF', icon: 'compress-pdf', category: 'organize', lead: true,
    short: 'Shrink a PDF to the exact size a form asks for: 200 KB, 1 MB, anything.',
    metaTitle: 'Compress PDF to 200 KB, 1 MB or any size',
    metaDescription: 'Compress a PDF to the exact size you need. Free, no sign-up, no upload: your file never leaves your device.',
    h1: 'Compress a PDF to the size you need',
    lede: 'Type the limit, like 200 KB, and we shrink your PDF to fit while keeping it as sharp as possible.',
    steps: [
      { title: 'Choose your PDF', text: 'Drop it in, or pick it from your phone or computer.' },
      { title: 'Type the size', text: 'Enter the limit the form or email asks for, like 200 KB or 2 MB.' },
      { title: 'Download', text: 'We find the best quality that still fits. Your file is ready in seconds.' },
    ],
    faq: [
      { q: 'Will my PDF still look good?', a: 'Yes. We try the gentlest setting first and only lower picture quality as much as needed to reach your size.' },
      { q: 'Why can’t my PDF get any smaller?', a: 'Text and drawings are already compact. Only pictures, such as photos and scans, can shrink a lot. If your PDF is mostly text, we tell you the smallest size we can reach, and you can choose to turn pages into pictures.' },
      { q: 'Is my file uploaded anywhere?', a: 'No. Everything happens inside your browser, on your own device.' },
      { q: 'Does it work on a phone?', a: 'Yes. Very large PDFs, with hundreds of pages, can be slow or too heavy for an older phone. A computer is faster.' },
      { q: 'What do Advanced settings do?', a: 'They let you choose picture quality and sharpness yourself, turn pictures black and white, or remove author details. With Advanced settings on, the size limit is switched off and your choices are used exactly as set.' },
      { q: 'Will links, forms and signatures still work?', a: 'Links and bookmarks normally stay. A digital signature stops being valid whenever a PDF is changed, and fillable form fields may not survive compression, so keep your original file.' },
    ],
  },
  {
    slug: 'merge-pdf', name: 'Merge PDF', navLabel: 'Merge PDF', icon: 'merge', category: 'organize', lead: true,
    short: 'Combine two or more PDFs into one, in the order you choose.',
    metaTitle: 'Merge PDF files into one, free',
    metaDescription: 'Combine two or more PDF files into a single PDF, in any order you choose. Free, no sign-up, and nothing is uploaded.',
    h1: 'Merge PDF files into one',
    lede: 'Add your PDFs, put them in the order you want, and join them into a single file.',
    steps: [
      { title: 'Add your PDFs', text: 'Choose two or more files.' },
      { title: 'Put them in order', text: 'Use the arrows to move a file up or down.' },
      { title: 'Download', text: 'Get one PDF with every page, in that order.' },
    ],
    faq: [
      { q: 'Is there a limit on how many files I can merge?', a: 'No set limit, only your device’s memory. Merging is fast even for large files, since pages are copied, not redrawn.' },
      { q: 'Does merging lower the quality?', a: 'No. Pages are copied exactly as they are.' },
      { q: 'Can I merge password-protected PDFs?', a: 'Unlock them first with the Unlock PDF tool, then merge.' },
    ],
  },
  {
    slug: 'split-pdf', name: 'Split PDF', navLabel: 'Split PDF', icon: 'split', category: 'organize', lead: true,
    short: 'Pull out the pages you need, or cut a PDF into smaller files.',
    metaTitle: 'Split a PDF into multiple files, free',
    metaDescription: 'Split a PDF by page ranges, every N pages, or into single pages. Free, no sign-up, and nothing is uploaded.',
    h1: 'Split a PDF into separate files',
    lede: 'Choose page ranges, split every few pages, or break it into single pages.',
    steps: [
      { title: 'Choose your PDF', text: 'Drop it in or pick it from your device.' },
      { title: 'Choose how to split it', text: 'By page ranges like 1-3, 5, by a fixed number of pages, or one file per page.' },
      { title: 'Download', text: 'Get each part as its own PDF, or all of them as a ZIP.' },
    ],
    faq: [
      { q: 'What does “1-3, 5, 8-” mean?', a: 'Each part separated by a comma becomes its own file. That example makes three files: pages 1 to 3, page 5, and page 8 to the end.' },
      { q: 'Can pages overlap between files?', a: 'Yes, if you list a page more than once, such as “1-3, 3-5”.' },
    ],
  },
  {
    slug: 'edit-pdf', name: 'Edit PDF', navLabel: 'Edit PDF', icon: 'edit-pdf', category: 'edit', lead: true,
    short: 'Add text, sign, draw, highlight, hide private details and rearrange pages.',
    metaTitle: 'Edit PDF online free: add text, sign, highlight, redact',
    metaDescription: 'Add text, signatures and pictures to a PDF. Highlight, redact and rearrange pages. Free, private, no sign-up — nothing is ever uploaded.',
    h1: 'Edit a PDF',
    lede: 'Add text, sign it, draw, highlight or hide private details, and rearrange the pages. Nothing leaves your device.',
    steps: [
      { title: 'Choose your PDF', text: 'Drop it in, or pick it from your phone or computer.' },
      { title: 'Pick a tool and click the page', text: 'Type, sign, draw, highlight or cover things up. Drag to move anything, and use Undo if you slip.' },
      { title: 'Download', text: 'Save your edited PDF. Rotate, delete and reorder pages from the strip on the left first if you need to.' },
    ],
    faq: [
      { q: 'Can I change the text that is already in my PDF?', a: 'Not directly. A PDF is not a Word document, so its words cannot be reflowed. Cover the old text with Whiteout, then type the new text on top with the Text tool. Most online PDF editors work this way.' },
      { q: 'Is Whiteout safe for hiding private information?', a: 'No. Whiteout only paints white over the top, and the hidden text is still inside the file. For account numbers, addresses and anything private, use Redact instead.' },
      { q: 'What does Redact do?', a: 'It removes what is under the black box for good. Any page with a black box is saved as a picture with the box burned in, so nothing can be copied or recovered. The rest of that page can no longer be selected as text.' },
      { q: 'Can I fill in a form?', a: 'Yes. Click where the answer goes and type, and use the Tick / cross tool for check boxes. This works on every form, including scanned ones. If the PDF has built-in fill-in fields, what is typed in them stays visible in the saved file, but they stop being fillable, so fill them in first.' },
      { q: 'Does it work in Hindi and other languages?', a: 'Yes. If your text uses letters the standard PDF fonts cannot draw, such as Hindi or the rupee sign, it is saved as a picture of the text so it looks exactly right. Ordinary English text stays real, selectable text.' },
      { q: 'Is a signature made here legally binding?', a: 'A drawn or typed signature is fine for many everyday forms. It is not a certified digital signature, and some organisations require those, so check with whoever asked you to sign.' },
      { q: 'Is my PDF uploaded anywhere?', a: 'No. Everything happens inside your browser, on your own device.' },
      { q: 'What about password-protected PDFs?', a: 'Remove the password first, then open the file here. We cannot edit a locked PDF.' },
    ],
  },
  {
    slug: 'compress-image', name: 'Compress Image', navLabel: 'Compress image', icon: 'compress-image', category: 'organize', lead: true,
    short: 'Make a JPG, PNG or WebP smaller than the size you type, like 100 KB.',
    metaTitle: 'Compress image to 20 KB, 100 KB, 200 KB or any size',
    metaDescription: 'Compress a JPG, PNG or WebP picture to the exact size you need. Free, no sign-up, and your pictures never leave your device.',
    h1: 'Compress a picture to the size you need',
    lede: 'Type the size limit, like 100 KB, and we find the best quality that fits. JPG, PNG and WebP.',
    steps: [
      { title: 'Choose your pictures', text: 'Drop in one or many. JPG, PNG, WebP and more.' },
      { title: 'Type the size', text: 'Enter the limit you need, like 50 KB or 1 MB.' },
      { title: 'Download', text: 'Each picture comes back smaller than your limit, as sharp as we can keep it.' },
    ],
    faq: [
      { q: 'Will the result really be under my size?', a: 'Yes. We aim a little below the number you type, so it passes on websites that count a kilobyte as 1,000 or as 1,024 bytes.' },
      { q: 'What if it can’t get that small?', a: 'We never pretend. If the picture would become too small to use, we say so and show the smallest version we could make.' },
      { q: 'Why does my PNG lose sharpness?', a: 'PNG has no quality setting, so the only way to make it smaller is to reduce its pixels. Saving as JPG or WebP usually looks better at the same size.' },
      { q: 'What happens to transparent backgrounds?', a: 'JPG cannot be see-through, so transparent areas turn white. PNG and WebP keep transparency.' },
      { q: 'Can I compress many pictures at once?', a: 'Yes. Add as many as you like and download them together as a ZIP.' },
    ],
  },
  {
    slug: 'resize-image', name: 'Resize Image', navLabel: 'Resize', icon: 'resize', category: 'edit',
    short: 'Change a picture’s width and height in pixels, or scale it by a percentage.',
    metaTitle: 'Resize image by pixels or percentage',
    metaDescription: 'Resize JPG, PNG and WebP pictures to exact pixel sizes or a percentage. Free and private: nothing is uploaded.',
    h1: 'Resize a picture',
    lede: 'Set a new width and height in pixels, or scale by a percentage. The picture keeps its shape unless you say otherwise.',
    steps: [
      { title: 'Choose your pictures', text: 'Drop in one or many.' },
      { title: 'Pick a size', text: 'Type a width or height, tap a common size, or use a percentage.' },
      { title: 'Download', text: 'Save each resized picture, or all of them as a ZIP.' },
    ],
    faq: [
      { q: 'Will my picture get stretched?', a: 'Not by default. “Keep the picture’s shape” is on, so typing a width sets the height for you. Turn it off if you want an exact width and height.' },
      { q: 'Does resizing lower the quality?', a: 'Making a picture smaller keeps it sharp. Making it bigger cannot add detail that was never there.' },
      { q: 'Is there a limit on picture size?', a: 'Only your device’s memory. Very large photos may be slow on older phones.' },
    ],
  },
  {
    slug: 'convert-image', name: 'Convert Image', navLabel: 'Convert', icon: 'convert', category: 'convert',
    short: 'Switch pictures between JPG, PNG, WebP and AVIF.',
    metaTitle: 'Convert images between JPG, PNG, WebP and AVIF',
    metaDescription: 'Convert JPG to PNG, PNG to JPG, WebP to JPG and more. Free, private, and nothing is uploaded.',
    h1: 'Convert pictures between formats',
    lede: 'Change JPG, PNG, WebP and AVIF pictures into each other. Do one or many at once.',
    steps: [
      { title: 'Choose your pictures', text: 'Drop in one or many.' },
      { title: 'Pick a format', text: 'JPG, PNG, WebP or AVIF.' },
      { title: 'Download', text: 'Save each picture, or all of them as a ZIP.' },
    ],
    faq: [
      { q: 'Which format should I choose?', a: 'JPG is the safest for photos. PNG keeps every detail and transparency. WebP is small and works almost everywhere. AVIF is smallest, but older apps cannot open it.' },
      { q: 'Can it open iPhone HEIC photos?', a: 'Not in most browsers yet. On an iPhone, set Camera to “Most Compatible”, or export the photo as JPG first.' },
      { q: 'What about animated GIFs?', a: 'Only the first frame is used.' },
    ],
  },
  {
    slug: 'image-to-pdf', name: 'Image to PDF', navLabel: 'Image to PDF', icon: 'image-pdf', category: 'convert', lead: true,
    short: 'Put photos or scans in order and save them as one PDF.',
    metaTitle: 'Convert images to PDF (JPG, PNG to PDF)',
    metaDescription: 'Turn JPG and PNG pictures into a single PDF. Choose the order, page size and margins. Free and private.',
    h1: 'Turn pictures into a PDF',
    lede: 'Put photos or scans in order and save them as one PDF, one picture per page.',
    steps: [
      { title: 'Choose your pictures', text: 'Drop in photos or scans.' },
      { title: 'Put them in order', text: 'Use the arrows to move a page up or down.' },
      { title: 'Download', text: 'Choose a page size, then save your PDF.' },
    ],
    faq: [
      { q: 'Will my photos lose quality?', a: 'Normally not. JPG and PNG pictures go into the PDF as they are. The PDF will be about as big as the pictures.' },
      { q: 'How do I make the PDF smaller?', a: 'Use Compress PDF afterwards and type the size you need.' },
      { q: 'Why is a photo sideways?', a: 'We follow the rotation stored in the photo. If it still looks wrong, rotate it in your photo app first.' },
    ],
  },
  {
    slug: 'pdf-to-image', name: 'PDF to Image', navLabel: 'PDF to image', icon: 'pdf-image', category: 'convert',
    short: 'Save PDF pages as JPG or PNG pictures.',
    metaTitle: 'Convert PDF to JPG or PNG',
    metaDescription: 'Turn PDF pages into JPG or PNG pictures. Choose pages and detail. Free and private: nothing is uploaded.',
    h1: 'Turn PDF pages into pictures',
    lede: 'Save every page, or just the ones you choose, as JPG or PNG pictures.',
    steps: [
      { title: 'Choose your PDF', text: 'Drop it in or pick it from your device.' },
      { title: 'Pick pages and detail', text: 'All pages, or something like 1-3, 5.' },
      { title: 'Download', text: 'Save one page, or all of them as a ZIP.' },
    ],
    faq: [
      { q: 'Which detail should I pick?', a: 'Standard is clear on screens. Choose High if you plan to print, and Small for quick sharing.' },
      { q: 'JPG or PNG?', a: 'JPG makes smaller files. PNG is sharper for text and drawings.' },
      { q: 'Is there a page limit?', a: 'No, but very long PDFs take longer and use more memory.' },
    ],
  },
  {
    slug: 'scan-to-pdf', name: 'Scan to PDF', navLabel: 'Scan to PDF', icon: 'camera', category: 'convert',
    short: 'Photograph paper documents with your phone and get a clean PDF.',
    metaTitle: 'Scan to PDF with your phone camera, free',
    metaDescription: 'Turn photos of paper documents into a clean PDF. Automatically brightens pages and sharpens text. Free and private.',
    h1: 'Scan a document with your phone',
    lede: 'Photograph each page, and we clean it up to look like a proper scan, then save it as one PDF.',
    steps: [
      { title: 'Photograph each page', text: 'Use “Take a photo”, or choose photos you already have.' },
      { title: 'Choose a look', text: '“Clean up” brightens the page; “Black & white” looks like a photocopy.' },
      { title: 'Download', text: 'Get one PDF with every page, in order.' },
    ],
    faq: [
      { q: 'Do I need good lighting?', a: 'Even light helps, but “Clean up” and “Black & white” both correct for shadows and dim rooms.' },
      { q: 'Will the text look sharp?', a: '“Black & white” gives the crispest text, similar to a photocopier. “Clean up” keeps colours, for pages with photos or coloured diagrams.' },
      { q: 'Can I reorder the pages?', a: 'Yes, use the arrows on each photo before saving.' },
    ],
  },
  {
    slug: 'rotate-pdf', name: 'Rotate PDF', navLabel: 'Rotate PDF', icon: 'rotate-pdf', category: 'organize',
    short: 'Turn any page in a PDF the right way up.',
    metaTitle: 'Rotate PDF pages online, free',
    metaDescription: 'Turn any page of a PDF 90, 180 or 270 degrees. Free, no sign-up, and nothing is uploaded.',
    h1: 'Rotate PDF pages',
    lede: 'See every page and turn the ones that are sideways or upside down.',
    steps: [
      { title: 'Choose your PDF', text: 'Drop it in or pick it from your device.' },
      { title: 'Turn the pages', text: 'Use the arrows under any page, or turn every page at once.' },
      { title: 'Download', text: 'Save the corrected PDF.' },
    ],
    faq: [
      { q: 'Can I rotate just one page?', a: 'Yes, each page has its own arrows.' },
      { q: 'Does this change the picture quality?', a: 'No. The page is turned, not redrawn.' },
    ],
  },
  {
    slug: 'remove-pages', name: 'Remove Pages', navLabel: 'Remove pages', icon: 'remove-pages', category: 'organize',
    short: 'Delete the pages you don’t want from a PDF.',
    metaTitle: 'Remove pages from a PDF, free',
    metaDescription: 'Delete unwanted pages from a PDF by clicking them. Free, no sign-up, and nothing is uploaded.',
    h1: 'Remove pages from a PDF',
    lede: 'Click the pages you want gone, then save what’s left.',
    steps: [
      { title: 'Choose your PDF', text: 'Drop it in or pick it from your device.' },
      { title: 'Click the pages to remove', text: 'They’re marked in red.' },
      { title: 'Download', text: 'Save the PDF without those pages.' },
    ],
    faq: [
      { q: 'Is the removed page really gone?', a: 'Yes, it is not copied into the new file at all.' },
      { q: 'Can I remove every page?', a: 'No, a PDF needs at least one page.' },
    ],
  },
  {
    slug: 'extract-pages', name: 'Extract Pages', navLabel: 'Extract pages', icon: 'extract-pages', category: 'organize',
    short: 'Pull specific pages out of a PDF into a new file.',
    metaTitle: 'Extract pages from a PDF, free',
    metaDescription: 'Pick pages from a PDF and save just those as a new file. Free, no sign-up, and nothing is uploaded.',
    h1: 'Extract pages from a PDF',
    lede: 'Click the pages you want to keep, then save them as a new PDF.',
    steps: [
      { title: 'Choose your PDF', text: 'Drop it in or pick it from your device.' },
      { title: 'Click the pages to keep', text: 'They’re marked with a tick.' },
      { title: 'Download', text: 'Get a new PDF with just those pages.' },
    ],
    faq: [
      { q: 'Does this remove the pages from my original?', a: 'No, your original file is never changed. You get a new PDF alongside it.' },
    ],
  },
  {
    slug: 'add-page-numbers', name: 'Page Numbers', navLabel: 'Page numbers', icon: 'hash', category: 'edit',
    short: 'Add page numbers in the style and spot you choose.',
    metaTitle: 'Add page numbers to a PDF, free',
    metaDescription: 'Add page numbers to a PDF in any corner, with a live preview. Free, no sign-up, and nothing is uploaded.',
    h1: 'Add page numbers to a PDF',
    lede: 'Choose the position and style, see it on the page as you go, then save.',
    steps: [
      { title: 'Choose your PDF', text: 'Drop it in or pick it from your device.' },
      { title: 'Set the position and style', text: 'Preview shows exactly where the numbers will sit.' },
      { title: 'Download', text: 'Every page gets numbered, in order.' },
    ],
    faq: [
      { q: 'Can I skip the cover page?', a: 'Yes. Set “Start numbering on page” to 2, and the cover stays blank.' },
      { q: 'Can numbering start somewhere other than 1?', a: 'Yes, set “First number” to whatever you like.' },
    ],
  },
  {
    slug: 'watermark-pdf', name: 'Watermark PDF', navLabel: 'Watermark', icon: 'watermark', category: 'edit',
    short: 'Stamp text or a logo across your pages, like CONFIDENTIAL or DRAFT.',
    metaTitle: 'Add a watermark to a PDF, free',
    metaDescription: 'Add a text or picture watermark to a PDF, with a live preview. Free, no sign-up, and nothing is uploaded.',
    h1: 'Add a watermark to a PDF',
    lede: 'Stamp text or a picture across every page, or just the ones you choose.',
    steps: [
      { title: 'Choose your PDF', text: 'Drop it in or pick it from your device.' },
      { title: 'Type your text or pick a picture', text: 'Choose the size, colour and how see-through it is.' },
      { title: 'Download', text: 'The watermark is applied to your chosen pages.' },
    ],
    faq: [
      { q: 'Can I watermark only some pages?', a: 'Yes, use Advanced settings to list the pages, like 1-3, 5.' },
      { q: 'Can I use my company logo?', a: 'Yes, choose “Picture” and upload it. A PNG with a transparent background works best.' },
    ],
  },
  {
    slug: 'protect-pdf', name: 'Protect PDF', navLabel: 'Protect', icon: 'lock', category: 'secure', lead: true,
    short: 'Lock a PDF with a password so only people who know it can open it.',
    metaTitle: 'Password protect a PDF, free',
    metaDescription: 'Add a password to a PDF with strong AES-256 encryption. Free, no sign-up, and nothing is uploaded.',
    h1: 'Add a password to a PDF',
    lede: 'Choose a password, and only people who know it will be able to open the file.',
    steps: [
      { title: 'Choose your PDF', text: 'Drop it in or pick it from your device.' },
      { title: 'Choose a password', text: 'Type it twice so you don’t lock yourself out.' },
      { title: 'Download', text: 'Share the protected PDF and the password separately.' },
    ],
    faq: [
      { q: 'How strong is the protection?', a: 'AES-256, the same strength banks use. Nobody can open the file without the password.' },
      { q: 'What if I forget the password?', a: 'We can’t recover it for you, and neither can anyone else. Keep it somewhere safe.' },
      { q: 'Can I stop people printing or copying text?', a: 'Yes, turn on Advanced settings to set those limits.' },
    ],
  },
  {
    slug: 'unlock-pdf', name: 'Unlock PDF', navLabel: 'Unlock', icon: 'unlock', category: 'secure',
    short: 'Remove a password from a PDF you know the password to.',
    metaTitle: 'Remove a PDF password, free',
    metaDescription: 'Remove the password from a PDF you have the right to open. Free, no sign-up, and nothing is uploaded.',
    h1: 'Remove a password from a PDF',
    lede: 'Type the password, and get back a copy that opens without one.',
    steps: [
      { title: 'Choose your locked PDF', text: 'Drop it in or pick it from your device.' },
      { title: 'Type the password', text: 'The one the file already asks for.' },
      { title: 'Download', text: 'Get a copy that opens for anyone.' },
    ],
    faq: [
      { q: 'Can this open a PDF I don’t have the password for?', a: 'No. This removes a password you already know; it cannot guess or crack one.' },
      { q: 'Is it legal to remove a password?', a: 'Only unlock files you own or have permission to open.' },
    ],
  },
  {
    slug: 'repair-pdf', name: 'Repair PDF', navLabel: 'Repair', icon: 'repair', category: 'organize',
    short: 'Fix a PDF that won’t open or shows an error.',
    metaTitle: 'Repair a broken or damaged PDF, free',
    metaDescription: 'Fix a PDF that won’t open or shows errors, by rebuilding it from what can still be read. Free and private.',
    h1: 'Repair a damaged PDF',
    lede: 'For files that won’t open, show an error, or seem to be missing pages.',
    steps: [
      { title: 'Choose the damaged PDF', text: 'Drop it in or pick it from your device.' },
      { title: 'We rebuild it', text: 'From everything inside the file that can still be read.' },
      { title: 'Download', text: 'Get a working copy.' },
    ],
    faq: [
      { q: 'Will this always fix my file?', a: 'It fixes the great majority of broken PDFs, such as ones cut off during a download or with a damaged index. If part of the file is truly missing, that part can’t come back.' },
      { q: 'Will formatting stay the same?', a: 'Yes, pages are rebuilt as they were. Interactive form fields and bookmarks may not survive.' },
    ],
  },
  {
    slug: 'pdf-to-text', name: 'PDF to Text', navLabel: 'PDF to text', icon: 'file-text', category: 'convert',
    short: 'Pull the words out of a PDF into a plain text file.',
    metaTitle: 'Convert PDF to text (.txt), free',
    metaDescription: 'Extract the text from a PDF into a plain .txt file. Free, no sign-up, and nothing is uploaded.',
    h1: 'Get the text out of a PDF',
    lede: 'Save the words inside a PDF as a plain text file, ready to paste anywhere.',
    steps: [
      { title: 'Choose your PDF', text: 'Drop it in or pick it from your device.' },
      { title: 'We read every page', text: 'Text is pulled out in reading order.' },
      { title: 'Download', text: 'Get a .txt file you can open anywhere.' },
    ],
    faq: [
      { q: 'Why is the file empty?', a: 'The PDF is probably a scan, which is just pictures of pages with no text underneath. Use PDF to Image instead.' },
      { q: 'Are tables and columns kept?', a: 'Not their exact layout, only the words, roughly in reading order.' },
    ],
  },
];

export const toolBySlug = (slug: string) => tools.find((t) => t.slug === slug)!;
export const toolsIn = (cat: Category) => tools.filter((t) => t.category === cat);

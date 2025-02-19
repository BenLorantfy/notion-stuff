import type {
  Annotations,
  AudioBlock,
  Blocks,
  BulletedListItemBlock,
  CalloutBlock,
  CalloutIconEmoji,
  CalloutIconExternal,
  CalloutIconFile,
  CodeBlock,
  EmbedBlock,
  ExternalFileWithCaption,
  FileBlock,
  FileWithCaption,
  HeadingBlock,
  ImageBlock,
  NumberedListItemBlock,
  ParagraphBlock,
  PDFBlock,
  QuoteBlock,
  RichText,
  RichTextEquation,
  RichTextMention,
  RichTextText,
  ToDoBlock,
  ToggleBlock,
  VideoBlock,
} from '@benlorantfy/notion-types';
import { processExternalVideoUrl } from './external-video.util';

const EOL_MD = '\n';

export interface NotionBlocksMarkdownParserOptions {
  /**
   * Use <figure> and <figcaption>
   */
  imageAsFigure: boolean;

  /**
   * Adds image size to end of markdown
   * See: https://stackoverflow.com/a/21242579
   */
  addImageSizeToAltText: boolean;

  /**
   * Must be provided if you set `addImageSizeToAltText` to true
   */
  getImageSize: (url: string) => Promise<{ width: number, height: number }>;

  /**
   * When a paragraphBlock#text is empty, render a &nbsp;
   */
  emptyParagraphToNonBreakingSpace: boolean;
}

export class NotionBlocksMarkdownParser {
  private static instance: NotionBlocksMarkdownParser;
  private readonly parserOptions: Required<NotionBlocksMarkdownParserOptions>;

  private constructor(options?: Partial<NotionBlocksMarkdownParserOptions>) {
    this.parserOptions = {
      imageAsFigure: true,
      emptyParagraphToNonBreakingSpace: false,
      ...(options || {}),
    };
  }

  static getInstance(options?: Partial<NotionBlocksMarkdownParserOptions>) {
    if (!this.instance) {
      this.instance = new this(options);
    }

    return this.instance;
  }

  async parse(blocks: Blocks, depth = 0): Promise<string> {
    let markdown = '';

    for (let childBlock of blocks) {
      const prefix = ' '.repeat(depth);
        
      let childBlockString = '';
      if (childBlock.has_children && childBlock[childBlock.type].children) {
        childBlockString = await this.parse(childBlock[childBlock.type].children, depth + 2);
      }

      if (childBlock.type === 'unsupported') {
        markdown += `${prefix}NotionAPI Unsupported`.concat(
          EOL_MD.repeat(2),
          childBlockString
        );
      }

      if (childBlock.type === 'paragraph') {
        markdown += `${prefix}${this.parseParagraph(childBlock)}${childBlockString}`;
      }

      if (childBlock.type === 'code') {
        markdown += `${prefix}${this.parseCodeBlock(childBlock)}${childBlockString}`;
      }

      if (childBlock.type === 'quote') {
        markdown += `${prefix}${this.parseQuoteBlock(childBlock)}${childBlockString}`;
      }

      if (childBlock.type === 'callout') {
        markdown +=
          `${prefix}${this.parseCalloutBlock(childBlock)}${childBlockString}`;
      }

      if (childBlock.type.startsWith('heading_')) {
        const headingLevel = Number(childBlock.type.split('_')[1]);
        markdown += `${prefix}${this.parseHeading(
          childBlock as HeadingBlock,
          headingLevel
        )}${childBlockString}`;
      }

      if (childBlock.type === 'bulleted_list_item') {
        markdown +=
          `${prefix}${this.parseBulletedListItems(childBlock)}${childBlockString}`;
      }

      if (childBlock.type === 'numbered_list_item') {
        markdown +=
          `${prefix}${this.parseNumberedListItems(childBlock)}${childBlockString}`;
      }

      if (childBlock.type === 'to_do') {
        markdown += `${prefix}${this.parseTodoBlock(childBlock)}${childBlockString}`;
      }

      if (childBlock.type === 'toggle') {
        markdown += `${prefix}${this.parseToggleBlock(childBlock).replace(
          '{{childBlock}}',
          childBlockString
        )}`;
      }

      if (childBlock.type === 'image') {
        markdown += `${prefix}${await this.parseImageBlock(childBlock)}${childBlockString}`;
      }

      if (childBlock.type === 'embed') {
        markdown += `${prefix}${this.parseEmbedBlock(childBlock)}${childBlockString}`;
      }

      if (childBlock.type === 'audio') {
        markdown += `${prefix}${this.parseAudioBlock(childBlock)}${childBlockString}`;
      }

      if (childBlock.type === 'video') {
        markdown += `${prefix}${this.parseVideoBlock(childBlock)}${childBlockString}`;
      }

      if (childBlock.type === 'file') {
        markdown += `${prefix}${this.parseFileBlock(childBlock)}${childBlockString}`;
      }

      if (childBlock.type === 'pdf') {
        markdown += `${prefix}${this.parsePdfBlock(childBlock)}${childBlockString}`;
      }

      if (childBlock.type === 'divider') {
        markdown += `${prefix}${EOL_MD}---${EOL_MD}${childBlockString}`;
      }
    }

    return markdown.concat(EOL_MD);
  }

  parseParagraph(paragraphBlock: ParagraphBlock): string {
    let text: string;

    if (
      this.parserOptions.emptyParagraphToNonBreakingSpace &&
      paragraphBlock.paragraph.rich_text.length === 0
    ) {
      text = '&nbsp;';
    } else {
      text = this.parseRichTexts(paragraphBlock.paragraph.rich_text);
    }

    return EOL_MD.concat(text, EOL_MD);
  }

  parseCodeBlock(codeBlock: CodeBlock): string {
    return `\`\`\`${codeBlock.code.language.toLowerCase() || ''}
${codeBlock.code.rich_text[0].text.content}
\`\`\``.concat(EOL_MD);
  }

  parseQuoteBlock(quoteBlock: QuoteBlock): string {
    return EOL_MD.concat(
      `> ${this.parseRichTexts(quoteBlock.quote.rich_text).split("\n").join("\n> ")}`,
      EOL_MD
    );
  }

  parseCalloutBlock(calloutBlock: CalloutBlock) {
    const callout = `<div notion-callout>
  {{icon}}
  <span notion-callout-text>
    ${this.parseRichTexts(calloutBlock.callout.rich_text)}
  </span>
</div>`;

    function getCalloutIcon(
      icon: CalloutIconEmoji | CalloutIconExternal | CalloutIconFile
    ) {
      switch (icon.type) {
        case 'emoji':
          return `<span notion-callout-emoji>${icon.emoji}</span>`;
        case 'external':
          return `<img notion-callout-external src='${icon.external.url}' alt='notion-callout-external-link'/>`;
        case 'file':
          // TODO: add support for Callout File
          return `notion-callout-file`;
      }
    }

    return EOL_MD.concat(
      callout.replace('{{icon}}', getCalloutIcon(calloutBlock.callout.icon)),
      EOL_MD
    );
  }

  parseHeading(headingBlock: HeadingBlock, headingLevel: number): string {
    return EOL_MD.concat(
      '#'.repeat(headingLevel),
      ' ',
      this.parseRichTexts(headingBlock[headingBlock.type].rich_text),
      EOL_MD
    );
  }

  parseBulletedListItems(bulletedListItemBlock: BulletedListItemBlock): string {
    // https://www.markdownguide.org/basic-syntax/#adding-elements-in-lists
    return '* '.concat(
      this.parseRichTexts(bulletedListItemBlock.bulleted_list_item.rich_text).split("\n").join("\n    "),
      EOL_MD
    );
  }

  parseNumberedListItems(numberedListItemBlock: NumberedListItemBlock): string {
    // https://www.markdownguide.org/basic-syntax/#adding-elements-in-lists
    return '1. '.concat(
      this.parseRichTexts(numberedListItemBlock.numbered_list_item.rich_text).split("\n").join("\n    "),
      EOL_MD
    );
  }

  parseTodoBlock(todoBlock: ToDoBlock): string {
    return `- [${todoBlock.to_do.checked ? 'x' : ' '}] `.concat(
      this.parseRichTexts(todoBlock.to_do.rich_text),
      EOL_MD
    );
  }

  parseToggleBlock(toggleBlock: ToggleBlock): string {
    return `<details><summary>${this.parseRichTexts(
      toggleBlock.toggle.rich_text
    )}</summary>{{childBlock}}</details>`;
  }

  async parseImageBlock(imageBlock: ImageBlock): Promise<string> {
    const { url, caption } = this.parseFile(imageBlock.image);
    if (this.parserOptions.imageAsFigure) {
      return `
<figure notion-figure>
  <img src='${url}' alt='${caption}'>
  <figcaption notion-figcaption>${caption}</figcaption>
</figure>
`.concat(EOL_MD);
    }

    if (this.parserOptions.addImageSizeToAltText) {
      if (!this.parserOptions.getImageSize) {
        throw new Error('parserOptions.getImageSize is required if parserOptions.addImageSizeToAltText is true')
      }

      const result = await this.parserOptions.getImageSize(url);

      if (!result.width || !result.height) {
        throw new Error("Could not find width/height for image");
      }

      return `![${caption}|${result.width}x${result.height}](${url})`.concat(EOL_MD);
    }
    return `![${caption}](${url})`.concat(EOL_MD);
  }

  parseAudioBlock(audioBlock: AudioBlock): string {
    const { url, caption } = this.parseFile(audioBlock.audio);
    return `![${caption}](${url})`;
  }

  parseVideoBlock(videoBlock: VideoBlock): string {
    const { url, caption } = this.parseFile(videoBlock.video);

    const [processed, iframeOrUrl] = processExternalVideoUrl(url);

    if (processed) {
      return EOL_MD.concat(iframeOrUrl, EOL_MD);
    }

    return `To be supported: ${url} with ${caption}`.concat(EOL_MD);
  }

  parseFileBlock(fileBlock: FileBlock): string {
    const { url, caption } = this.parseFile(fileBlock.file);
    return `To be supported: ${url} with ${caption}`.concat(EOL_MD);
  }

  parsePdfBlock(pdfBlock: PDFBlock): string {
    const { url, caption } = this.parseFile(pdfBlock.pdf);
    return `
<figure>
  <object data='${url}' type='application/pdf'></object>
  <figcaption>${caption}</figcaption>
</figure>
`.concat(EOL_MD);
  }

  parseEmbedBlock(embedBlock: EmbedBlock): string {
    const embedded = `<iframe src='${embedBlock.embed.url}'></iframe>`;

    if (embedBlock.embed.caption) {
      return `
<figure>
  ${embedded}
  <figcaption>${this.parseRichTexts(embedBlock.embed.caption)}</figcaption>
</figure>`.concat(EOL_MD);
    }

    return embedded.concat(EOL_MD);
  }

  parseRichTexts(richTexts: RichText[]): string {
    return richTexts.reduce((parsedContent, richText) => {
      switch (richText.type) {
        case 'text':
          parsedContent += this.parseText(richText);
          break;
        case 'mention':
          parsedContent += this.parseMention(richText);
          break;
        case 'equation':
          parsedContent += this.parseEquation(richText);
          break;
      }

      return parsedContent;
    }, '');
  }

  parseText(richText: RichTextText): string {
    let content = this.annotate(richText.annotations, richText.text.content);

    return richText.text.link
      ? this.annotateLink(richText.text, content)
      : content;
  }

  // TODO: support mention when we know what it actually means

  parseMention(mention: RichTextMention): string {
    switch (mention.mention.type) {
      case 'user':
        break;
      case 'page':
        break;
      case 'database':
        break;
      case 'date':
        break;
    }
    return this.annotate(mention.annotations, mention.plain_text);
  }

  parseEquation(equation: RichTextEquation): string {
    return this.annotate(
      equation.annotations,
      `$${equation.equation.expression}$`
    );
  }

  parseFile(file: ExternalFileWithCaption | FileWithCaption): {
    caption: string;
    url: string;
  } {
    let fileContent = {
      caption: '',
      url: '',
    };

    switch (file.type) {
      case 'external':
        fileContent.url = file.external.url;
        break;
      case 'file':
        fileContent.url = file.file.url;
        break;
    }

    fileContent.caption = file.caption
      ? this.parseRichTexts(file.caption)
      : fileContent.url;

    return fileContent;
  }

  private annotate(annotations: Annotations, originalContent: string): string {
    return Object.entries(annotations).reduce(
      (
        annotatedContent,
        [modifier, isOnOrColor]: [
          keyof Annotations,
          boolean | Annotations['color']
        ]
      ) =>
        isOnOrColor
          ? this.annotateModifier(
              modifier,
              annotatedContent,
              isOnOrColor as Annotations['color']
            )
          : annotatedContent,
      originalContent
    );
  }

  private annotateLink(
    text: RichTextText['text'],
    annotatedContent: string
  ): string {
    return `[${annotatedContent}](${
      text.link.url ? text.link.url : text.link
    })`;
  }

  private annotateModifier(
    modifier: keyof Annotations,
    originalContent: string,
    color?: Annotations['color']
  ): string {
    switch (modifier) {
      case 'bold':
        return `**${originalContent}**`;
      case 'italic':
        return `_${originalContent}_`;
      case 'strikethrough':
        return `~~${originalContent}~~`;
      case 'underline':
        return `<u>${originalContent}</u>`;
      case 'code':
        return `\`${originalContent}\``;
      case 'color':
        if (color !== 'default') {
          return `<span notion-color='${color}'>${originalContent}</span>`;
        }
        return originalContent;
    }
  }
}

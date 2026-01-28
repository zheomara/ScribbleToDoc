
/**
 * Generates a DOCX Blob from markdown-like text content.
 * Accesses global 'docx' object from the loaded CDN script.
 */
export const generateDocxBlob = async (content: string, title: string = "Transcribed Notes") => {
  // Check both window.docx and window.DOCX as different bundles might use different names
  const globalDocx = (window as any).docx || (window as any).DOCX;
  
  if (!globalDocx) {
    console.error("Docx library not found on window object.");
    throw new Error("Docx library not initialized. Please refresh the page.");
  }

  const { Document, Packer, Paragraph, TextRun } = globalDocx;

  // Safe access to HeadingLevel, falling back to string literals if the Enum isn't loaded correctly
  const HeadingLevel = globalDocx.HeadingLevel || {
    TITLE: "Title",
    HEADING_1: "Heading1",
    HEADING_2: "Heading2",
    HEADING_3: "Heading3",
    HEADING_4: "Heading4"
  };

  // XML Sanitizer: Removes control characters (ASCII 0-31) except Tab, Line Feed, Carriage Return
  // This is critical because Word will refuse to open files containing null bytes or other control codes.
  const sanitize = (str: string): string => {
    if (!str) return "";
    return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  };

  const lines = content.split('\n');
  const sections: any[] = [];

  lines.forEach((line) => {
    const rawText = line.trim();
    if (!rawText) return;

    const text = sanitize(rawText);

    if (text.startsWith('# ')) {
      sections.push(new Paragraph({
        text: text.substring(2).trim(),
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 120 }
      }));
    } else if (text.startsWith('## ')) {
      sections.push(new Paragraph({
        text: text.substring(3).trim(),
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 }
      }));
    } else if (text.startsWith('- ')) {
      sections.push(new Paragraph({
        children: [
          new TextRun({
            text: text.substring(2).trim(),
            size: 24, // 12pt
          })
        ],
        bullet: { level: 0 },
        spacing: { after: 120 }
      }));
    } else {
      sections.push(new Paragraph({
        children: [
          new TextRun({
            text: text,
            size: 24, // 12pt
          })
        ],
        spacing: { after: 120 }
      }));
    }
  });

  try {
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: sanitize(title),
            heading: HeadingLevel.TITLE,
            spacing: { after: 400 }
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
                italics: true,
                color: "666666",
                size: 20 // 10pt
              })
            ],
            spacing: { after: 400 }
          }),
          ...sections
        ],
      }],
    });

    return await Packer.toBlob(doc);
  } catch (err) {
    console.error("Error during docx construction or packaging:", err);
    throw err;
  }
};

/**
 * Generates and triggers a download for a DOCX file.
 */
export const generateDocx = async (content: string, filename: string) => {
  try {
    const blob = await generateDocxBlob(content);
    const saveAs = (window as any).saveAs;
    
    if (saveAs) {
      saveAs(blob, `${filename}.docx`);
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.docx`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    }
  } catch (error) {
    console.error("Critical error generating DOCX download:", error);
    alert(error instanceof Error ? error.message : "Could not generate Word document.");
  }
};

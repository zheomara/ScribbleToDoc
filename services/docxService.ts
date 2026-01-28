
/**
 * Generates a DOCX Blob from markdown-like text content.
 * Accesses global 'docx' object from the loaded CDN script.
 */
export const generateDocxBlob = async (content: string, title: string = "Transcribed Notes") => {
  // Check both window.docx and window.DOCX as different bundles might use different names
  const globalDocx = (window as any).docx || (window as any).DOCX;
  
  if (!globalDocx) {
    console.error("Docx library not found on window object (checked window.docx and window.DOCX).");
    // If we're here, the script might have failed to load or is an ESM build on a browser expecting UMD
    throw new Error("Docx library not initialized. This can happen if the CDN script failed to load or hasn't finished loading. Please refresh the page or check your connection.");
  }

  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = globalDocx;

  if (!Document || !Packer) {
    console.error("Docx library components missing from global object:", globalDocx);
    throw new Error("The Docx library was found but its components (Document, Packer) are missing. This may be due to a version mismatch or an incorrect script build.");
  }

  const lines = content.split('\n');
  const sections: any[] = [];

  lines.forEach((line) => {
    const text = line.trim();
    if (!text) return;

    if (text.startsWith('# ')) {
      sections.push(new Paragraph({
        text: text.substring(2),
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 120 }
      }));
    } else if (text.startsWith('## ')) {
      sections.push(new Paragraph({
        text: text.substring(3),
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 }
      }));
    } else if (text.startsWith('- ')) {
      sections.push(new Paragraph({
        text: text.substring(2),
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
            text: title,
            heading: HeadingLevel.TITLE,
            spacing: { after: 400 }
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
                italics: true,
                color: "666666"
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
    // saveAs is usually provided by FileSaver.js
    const saveAs = (window as any).saveAs;
    
    if (saveAs) {
      saveAs(blob, `${filename}.docx`);
    } else {
      console.warn("saveAs not found on window, falling back to manual link download.");
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
    alert(error instanceof Error ? error.message : "Could not generate Word document. Please check the console for errors.");
    throw error;
  }
};

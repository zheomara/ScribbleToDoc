
/**
 * Generates a PDF Blob from text content using jsPDF.
 */
export const generatePdfBlob = async (content: string, title: string = "Transcribed Notes"): Promise<Blob> => {
  const globalJsPDF = (window as any).jspdf;
  if (!globalJsPDF) {
    throw new Error("jsPDF library not loaded");
  }

  const { jsPDF } = globalJsPDF;
  // Default is A4
  const doc = new jsPDF();

  const margin = 20; // mm
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxLineWidth = pageWidth - (margin * 2);
  
  let y = 20;

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(title, margin, y);
  y += 15;

  // Metadata
  doc.setFont("helvetica", "italic");
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, margin, y);
  doc.setTextColor(0);
  y += 15;

  const lines = content.split('\n');
  
  // Helper to check page break
  const checkPageBreak = (heightAdded: number) => {
    if (y + heightAdded > pageHeight - margin) {
      doc.addPage();
      y = margin;
      return true;
    }
    return false;
  };

  lines.forEach(line => {
    let text = line.trim();
    if (!text) {
      y += 5;
      checkPageBreak(0);
      return;
    }

    if (text.startsWith('# ')) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      text = text.replace(/^#\s+/, '');
      const splitText = doc.splitTextToSize(text, maxLineWidth);
      const height = splitText.length * 8; // approx line height for 16pt
      checkPageBreak(height);
      doc.text(splitText, margin, y);
      y += height + 4;
    } else if (text.startsWith('## ')) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      text = text.replace(/^##\s+/, '');
      const splitText = doc.splitTextToSize(text, maxLineWidth);
      const height = splitText.length * 7;
      checkPageBreak(height);
      doc.text(splitText, margin, y);
      y += height + 3;
    } else if (text.startsWith('- ')) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      text = text.replace(/^-\s+/, '');
      const splitText = doc.splitTextToSize(text, maxLineWidth - 8);
      const height = splitText.length * 6;
      checkPageBreak(height);
      doc.text("•", margin, y);
      doc.text(splitText, margin + 6, y);
      y += height + 2;
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      const splitText = doc.splitTextToSize(text, maxLineWidth);
      const height = splitText.length * 6;
      checkPageBreak(height);
      doc.text(splitText, margin, y);
      y += height + 2;
    }
  });

  return doc.output('blob');
};

/**
 * Generates and downloads a PDF file.
 */
export const generatePdf = async (content: string, filename: string) => {
  try {
    const blob = await generatePdfBlob(content, filename);
    const saveAs = (window as any).saveAs;
    if (saveAs) {
      saveAs(blob, `${filename}.pdf`);
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    }
  } catch (error) {
    console.error("Error generating PDF:", error);
    alert("Could not generate PDF. Please try again.");
  }
};

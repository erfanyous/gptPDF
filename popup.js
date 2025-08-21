document.getElementById("download").addEventListener("click", async () => {
  const button = document.getElementById("download");
  const status = document.getElementById("status");

  const fontSize = document.getElementById("fontSize").value;

  let filename = prompt(
    "Enter filename for the PDF (without .pdf):",
    "chatgpt_conversation"
  );
  if (!filename) {
    status.textContent = "PDF generation cancelled.";
    return;
  }
  filename = filename.trim() + ".pdf";

  button.disabled = true;
  status.textContent = "Generating PDF...";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  await chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    files: ["libs/katex.min.css", "libs/default.min.css", "libs/code-font-override.css"],
  });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: [
      "html2pdf.bundle.min.js",
      "libs/katex.min.js",
      "libs/auto-render.min.js",
      "libs/highlight.min.js",
    ],
  });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [filename, fontSize],
    func: (filename, fontSize) => {
      // Helper function to check for RTL text
      const isRTL = (text) => {
        const rtlRegex = /[\u0590-\u05FF\u0600-\u06FF]/;
        return rtlRegex.test(text);
      };

      // Helper function to style the final content before PDF generation
      const stylePdfContent = (container) => {
        // Apply base font styles
        container.style.fontFamily = "Tahoma, Arial, sans-serif";
        container.style.fontSize = fontSize;
        container.style.lineHeight = "1.6";

        // Remove unwanted UI elements that might have been picked up
        container
          .querySelectorAll(
            "button, .copy-button, .edit-button, [aria-label='Copy code']"
          )
          .forEach((el) => el.remove());

        // General styling for elements, avoiding math and code blocks
        container.querySelectorAll("*").forEach((el) => {
          if (el.closest("pre, .katex")) {
            // Don't apply general styles to code or math
            return;
          }

          el.style.fontWeight = "normal";
          el.style.fontSize = fontSize;

          // Flatten headings
          if (/^H[1-6]$/.test(el.tagName)) {
            const div = document.createElement("div");
            div.innerHTML = el.innerHTML;
            el.replaceWith(div);
          }
        });

        // Granular RTL styling
        container.querySelectorAll('p, div, li').forEach(block => {
            if (block.closest('pre, .katex')) {
                return;
            }
            if (isRTL(block.textContent)) {
                block.style.direction = 'rtl';
                block.style.textAlign = 'right';
            }
        });

        // Style tables
        container.querySelectorAll("table").forEach((el) => {
          el.style.width = "100%";
          el.style.borderCollapse = "collapse";
          el.style.marginBottom = "20px";
          el.querySelectorAll("th, td").forEach((cell) => {
            cell.style.border = "1px solid #ddd";
            cell.style.padding = "8px";
            cell.style.textAlign = "left";
          });
          el.querySelectorAll("th").forEach((th) => {
            th.style.backgroundColor = "#4CAF50";
            th.style.color = "white";
            th.style.fontWeight = "bold";
          });
          const bodyRows = Array.from(el.querySelectorAll("tr")).filter(
            (row) => !row.querySelector("th")
          );
          bodyRows.forEach((tr, index) => {
            if (index % 2 === 1) {
              tr.style.backgroundColor = "#f2f2f2";
            }
          });
        });
      };

      // 1. Create a container and populate it with RAW HTML from the page
      const container = document.createElement("div");
      container.style.padding = "5px";

      const userMessages = document.querySelectorAll(
        ".whitespace-pre-wrap:not(.dark\\:whitespace-pre-wrap)"
      );
      const botResponses = document.querySelectorAll(
        ".markdown.prose.w-full.break-words.dark\\:prose-invert"
      );

      const count = Math.min(userMessages.length, botResponses.length);
      for (let i = 0; i < count; i++) {
        const qWrapper = document.createElement("div");
        qWrapper.style.margin = "20px 0";
        qWrapper.style.color = "red";
        // RTL logic is now handled later
        const qPrefix = document.createElement("span");
        qPrefix.textContent = `Q${i + 1}: `;
        qPrefix.style.fontWeight = "bold";
        const qContent = document.createElement("span");
        qContent.innerHTML = userMessages[i].innerHTML;
        qWrapper.append(qPrefix, qContent);
        container.appendChild(qWrapper);

        const aWrapper = document.createElement("div");
        aWrapper.style.margin = "10px 0 24px 0";
        aWrapper.style.color = "black";
        // RTL logic is now handled later
        const aContent = document.createElement("span");
        aContent.innerHTML = botResponses[i].innerHTML;
        aWrapper.appendChild(aContent);
        container.appendChild(aWrapper);
      }

      document.body.appendChild(container);

      // 2. Render Math formulas on the raw HTML
      renderMathInElement(container, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\[", right: "\\]", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false },
        ],
        trust: true,
      });

      // 3. Highlight Code blocks
      container.querySelectorAll("pre code").forEach((block) => {
        // Ensure the code tag has the language class if available
        const pre = block.closest('pre');
        const langDiv = pre.previousElementSibling;
        if (langDiv && langDiv.querySelector('span')) {
            const lang = langDiv.querySelector('span').innerText.toLowerCase();
            block.classList.add(`language-${lang}`);
        }
        hljs.highlightElement(block);
      });

      // 4. Apply final styling and cleaning (including RTL)
      stylePdfContent(container);

      // 5. Generate PDF
      html2pdf()
        .set({
          margin: 0.5,
          filename: filename,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
          pagebreak: { mode: ["avoid-all", "css", "legacy"] },
        })
        .from(container)
        .save()
        .then(() => {
          container.remove();
          chrome.runtime.sendMessage({ type: "pdfComplete" });
        });
    },
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "pdfComplete") {
      button.disabled = false;
      status.textContent = "PDF download complete.";
      setTimeout(() => (status.textContent = ""), 3000);
    }
  });
});

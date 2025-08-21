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
      // Helper function to wrap RTL text segments in spans with dir="rtl"
      const spanWrapRtl = (element) => {
        const rtlRegex = /[\u0590-\u05FF\u0600-\u06FF][\u0590-\u05FF\u0600-\u06FF\s]*/g;
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
        let node;
        const nodesToProcess = [];

        while (node = walker.nextNode()) {
            if (node.parentElement.closest('script, style, pre, .katex')) {
                continue;
            }
            nodesToProcess.push(node);
        }

        nodesToProcess.forEach(node => {
            const text = node.textContent;
            const matches = [...text.matchAll(rtlRegex)];
            if (matches.length === 0) return;

            const fragment = document.createDocumentFragment();
            let lastIndex = 0;
            matches.forEach(match => {
                const rtlText = match[0];
                const index = match.index;
                if (index > lastIndex) {
                    fragment.appendChild(document.createTextNode(text.substring(lastIndex, index)));
                }
                const span = document.createElement('span');
                span.dir = 'rtl';
                span.textContent = rtlText;
                fragment.appendChild(span);
                lastIndex = index + rtlText.length;
            });

            if (lastIndex < text.length) {
                fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
            }
            node.parentNode.replaceChild(fragment, node);
        });
      };

      // Helper function to apply final styles after rendering
      const stylePdfContent = (container) => {
        container.style.fontFamily = "Tahoma, Arial, sans-serif";
        container.style.fontSize = fontSize;
        container.style.lineHeight = "1.6";
        container
          .querySelectorAll("button, .copy-button, .edit-button, [aria-label='Copy code']")
          .forEach((el) => el.remove());

        container.querySelectorAll("*").forEach((el) => {
          if (el.closest("pre, .katex")) return;
          el.style.fontWeight = "normal";
          el.style.fontSize = fontSize;
          if (/^H[1-6]$/.test(el.tagName)) {
            const div = document.createElement("div");
            div.innerHTML = el.innerHTML;
            el.replaceWith(div);
          }
        });

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
            if (index % 2 === 1) tr.style.backgroundColor = "#f2f2f2";
          });
        });
      };

      // 1. Create container and populate with RAW HTML
      const container = document.createElement("div");
      container.style.padding = "5px";
      const userMessages = document.querySelectorAll(
        ".whitespace-pre-wrap:not(.dark\\:whitespace-pre-wrap)"
      );
      const botResponses = document.querySelectorAll(
        ".markdown.prose.w-full.break-words.dark\\:prose-invert"
      );

      for (let i = 0; i < Math.min(userMessages.length, botResponses.length); i++) {
        const qWrapper = document.createElement("div");
        qWrapper.style.margin = "20px 0";
        qWrapper.style.color = "red";
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
        const aContent = document.createElement("span");
        aContent.innerHTML = botResponses[i].innerHTML;
        aWrapper.appendChild(aContent);
        container.appendChild(aWrapper);
      }

      document.body.appendChild(container);

      // 2. Apply intelligent RTL span wrapping BEFORE rendering
      spanWrapRtl(container);

      // 3. Render Math formulas
      renderMathInElement(container, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\[", right: "\\]", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false },
        ],
        trust: true,
      });

      // 4. Highlight Code blocks
      container.querySelectorAll("pre code").forEach((block) => {
        const pre = block.closest('pre');
        const langDiv = pre.previousElementSibling;
        if (langDiv && langDiv.querySelector('span')) {
            const lang = langDiv.querySelector('span').innerText.toLowerCase();
            block.classList.add(`language-${lang}`);
        }
        hljs.highlightElement(block);
      });

      // 5. Apply final styling
      stylePdfContent(container);

      // 6. Generate PDF
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

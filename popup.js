document.getElementById("download").addEventListener("click", async () => {
  const button = document.getElementById("download");
  const status = document.getElementById("status");

  const fontSize = document.getElementById("fontSize").value;

  // Ask for filename
  let filename = prompt(
    "Enter filename for the PDF (without .pdf):",
    "chatgpt_conversation"
  );
  if (!filename) {
    status.textContent = "PDF generation cancelled.";
    return;
  }
  filename = filename.trim() + ".pdf";

  // Show progress
  button.disabled = true;
  status.textContent = "Generating PDF...";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Inject html2pdf
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["html2pdf.bundle.min.js"],
  });

  // Inject logic to generate the PDF
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [filename, fontSize],
    func: (filename, fontSize) => {
      const loadScripts = () => {
        return new Promise((resolve) => {
          const loadScript = (src, onload) => {
            const script = document.createElement("script");
            script.src = src;
            script.onload = onload;
            document.head.appendChild(script);
          };

          // Load KaTeX CSS
          const katexCSS = document.createElement("link");
          katexCSS.rel = "stylesheet";
          katexCSS.href =
            "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css";
          document.head.appendChild(katexCSS);

          // Load highlight.js CSS
          const hljsCSS = document.createElement("link");
          hljsCSS.rel = "stylesheet";
          hljsCSS.href =
            "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/default.min.css";
          document.head.appendChild(hljsCSS);

          // Load scripts sequentially
          loadScript(
            "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js",
            () => {
              loadScript(
                "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js",
                () => {
                  loadScript(
                    "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js",
                    resolve
                  );
                }
              );
            }
          );
        });
      };

      loadScripts().then(() => {
        const container = document.createElement("div");
        container.style.padding = "5px";
        container.style.fontFamily = "Arial, sans-serif";
        container.style.fontSize = fontSize;
        container.style.lineHeight = "1.6";

        const userMessages = document.querySelectorAll(
          ".whitespace-pre-wrap:not(.dark\\:whitespace-pre-wrap)"
        );
        const botResponses = document.querySelectorAll(
          ".markdown.prose.w-full.break-words.dark\\:prose-invert"
        );

        const isRTL = (text) => {
          const rtlRegex = /[\u0590-\u05FF\u0600-\u06FF]/;
          return rtlRegex.test(text);
        };

        const cleanHTML = (html) => {
          const temp = document.createElement("div");
          temp.innerHTML = html;

          // Remove unwanted UI elements
          temp
            .querySelectorAll(
              "button, .copy-button, .edit-button, [aria-label='Copy code']"
            )
            .forEach((el) => el.remove());

          // Ensure code blocks are structured for highlight.js
          temp.querySelectorAll("pre").forEach((pre) => {
            if (!pre.querySelector("code")) {
              pre.innerHTML = `<code>${pre.innerHTML}</code>`;
            }
          });

          // Clean all other elements
          temp.querySelectorAll("*").forEach((el) => {
            if (el.closest("pre")) {
              // Inside code blocks, we let highlight.js handle styling
              el.removeAttribute("style");
            } else {
              el.removeAttribute("class");
              el.removeAttribute("style");

              if (/^H[1-6]$/.test(el.tagName)) {
                const div = document.createElement("div");
                div.innerHTML = el.innerHTML;
                div.style.fontWeight = "normal";
                div.style.fontSize = fontSize;
                el.replaceWith(div);
              }

              el.style.fontWeight = "normal";
              el.style.fontSize = fontSize;
            }
          });

          // Style tables
          temp.querySelectorAll("table").forEach((el) => {
            el.style.width = "100%";
            el.style.borderCollapse = "collapse";
            el.style.marginBottom = "20px";

            // Set basic cell styles first
            el.querySelectorAll("th, td").forEach((cell) => {
              cell.style.border = "1px solid #ddd";
              cell.style.padding = "8px";
              cell.style.textAlign = "left";
            });

            // Style header cells
            el.querySelectorAll("th").forEach((th) => {
              th.style.backgroundColor = "#4CAF50";
              th.style.color = "white";
              th.style.fontWeight = "bold";
            });

            // Style body rows with alternating colors
            const bodyRows = Array.from(el.querySelectorAll("tr")).filter(
              (row) => !row.querySelector("th")
            );
            bodyRows.forEach((tr, index) => {
              if (index % 2 === 1) {
                // Apply to even rows
                tr.style.backgroundColor = "#f2f2f2";
              }
            });
          });

          return temp.innerHTML;
        };

        const count = Math.min(userMessages.length, botResponses.length);
        for (let i = 0; i < count; i++) {
          const qWrapper = document.createElement("div");
          qWrapper.style.margin = "20px 0";
          qWrapper.style.color = "red";

          if (isRTL(userMessages[i].textContent)) {
            qWrapper.dir = "rtl";
            qWrapper.style.textAlign = "right";
          }

          const qPrefix = document.createElement("span");
          qPrefix.textContent = `Q${i + 1}: `;
          qPrefix.style.fontWeight = "bold";
          qPrefix.style.fontSize = fontSize;

          const qContent = document.createElement("span");
          qContent.innerHTML = cleanHTML(userMessages[i].innerHTML);
          qContent.style.fontSize = fontSize;

          qWrapper.appendChild(qPrefix);
          qWrapper.appendChild(qContent);
          container.appendChild(qWrapper);

          const aWrapper = document.createElement("div");
          aWrapper.style.margin = "10px 0 24px 0";
          aWrapper.style.color = "black";
          aWrapper.style.fontSize = fontSize;

          if (isRTL(botResponses[i].textContent)) {
            aWrapper.dir = "rtl";
            aWrapper.style.textAlign = "right";
          }

          const aContent = document.createElement("span");
          aContent.innerHTML = cleanHTML(botResponses[i].innerHTML);
          aContent.style.fontSize = fontSize;

          aWrapper.appendChild(aContent);
          container.appendChild(aWrapper);
        }

        document.body.appendChild(container);

        // Render math
        renderMathInElement(container, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "\\[", right: "\\]", display: true },
            { left: "$", right: "$", display: false },
            { left: "\\(", right: "\\)", display: false },
          ],
        });

        // Highlight code
        container.querySelectorAll("pre code").forEach((block) => {
          hljs.highlightElement(block);
        });

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
      });
    },
  });

  // Listen for PDF complete signal
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "pdfComplete") {
      button.disabled = false;
      status.textContent = "PDF download complete.";
      setTimeout(() => (status.textContent = ""), 3000);
    }
  });
});

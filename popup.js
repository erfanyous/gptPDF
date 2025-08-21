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

        temp
          .querySelectorAll(
            "button, .copy-button, .edit-button, [aria-label='Copy code']"
          )
          .forEach((el) => el.remove());

        temp.querySelectorAll("pre").forEach((pre) => {
          if (!pre.querySelector("code")) {
            pre.innerHTML = `<code>${pre.innerHTML}</code>`;
          }
        });

        temp.querySelectorAll("*").forEach((el) => {
          if (el.closest("pre")) {
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

        temp.querySelectorAll("table").forEach((el) => {
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

      renderMathInElement(container, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\[", right: "\\]", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false },
        ],
        trust: true,
      });

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

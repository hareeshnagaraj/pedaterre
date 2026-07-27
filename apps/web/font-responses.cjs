const path = require("node:path");

const fontDirectory = path.join(__dirname, "public", "fonts");

function fontFaces(family, weights, files) {
  return weights
    .map((weight) => {
      const file = files[weight] ?? files.variable;
      return `/* latin */
@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url(${path.join(fontDirectory, file)}) format('truetype');
}`;
    })
    .join("\n");
}

module.exports = {
  "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&display=swap":
    fontFaces(
      "Barlow Condensed",
      ["600", "700", "800"],
      {
        600: "BarlowCondensed-SemiBold.ttf",
        700: "BarlowCondensed-Bold.ttf",
        800: "BarlowCondensed-ExtraBold.ttf",
      },
    ),
  "https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;500;600;700&display=swap":
    fontFaces(
      "Libre Franklin",
      ["400", "500", "600", "700"],
      { variable: "LibreFranklin-Variable.ttf" },
    ),
};

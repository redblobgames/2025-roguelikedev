/* HACK: if I have a special parameter, 
 *    1. hide everything except the canvas
 *    2. add a magenta background and border
 *
 * I'm using this with screenshot.sh to capture screenshots
 * periodically. The imagemagick -trim parameter will remove the color
 * at the corners of the image. By setting those to magenta, I can
 * remove both that added border and the background, so that the image
 * is cropped to just the <figure> area.
 */
if (window.location.search === "?screenshot") {
    const figure = document.querySelector("figure");
    const canvas = figure.querySelector("canvas");
    figure.style.margin = "0";
    document.body.innerHTML = "";
    document.body.appendChild(figure);
    document.body.style.width = `${canvas.clientWidth}px`;
    document.body.style.height = `${figure.clientHeight}px`;
    document.body.style.margin = "4px";
    document.body.parentElement.style.background = "#f0f";
    /* I should canvas.focus() but that creates a focus rectangle that
       messes up the screenshot, so instead I hide the focus reminder text. */
    figure.querySelector("#focus-reminder").textContent = ""; }

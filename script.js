const lenis = new Lenis({
  content: document.querySelector("#scrollCont"),
  lerp: 0.03,
});

function onRaf(time) {
  lenis.raf(time);
  requestAnimationFrame(onRaf);
}

requestAnimationFrame(onRaf);

const pageList = ['.slide1', '.proj1', '.proj2', '.proj3', '.about', '.foot']
const pages = document.querySelectorAll(".page")
const findHeight = (qty) => {
  let tot = 0;
  for (let pgCount = 0; pgCount <= (qty - 1); pgCount++) {
    el = document.querySelector(pageList[pgCount])
    tot += el.offsetHeight
  }

  return tot;
};

const cursor1 = document.querySelector(".slide1 .cursor");
const cursor2 = document.querySelectorAll(".project .cursor");
const cursor3 = document.querySelector(".about .cursor")

document.addEventListener("mousemove", (e) => {
  cursor1.style.left = e.pageX + "px";
  cursor1.style.top = e.pageY + "px";

  cursor2.forEach(el => {
    el.style.left = e.clientX + "px";
    el.style.top = e.clientY + "px";
  });

  cursor3.style.left = e.clientX + "px";
  cursor3.style.top =  `calc(${e.pageY - findHeight(4)}px`;
});

let infScrolled = false;
const infScrollInner = document.querySelector(".skills .inner");

window.addEventListener("scroll", () => {
  if (inView(skills) && !infScrolled) {
    infScrolled = true;
    infScrollInner.classList.add("scroll")
    let speed = 30;
    let intDur = 1000;
    const progressEndVal = [95, 85, 75, 70, 100, 80, 60, 60, 80, 75, 100, 60];

    let el = 0;

    let progress = setInterval(() => {
      el++;
      let progressVal = 0;
      let endVal = progressEndVal[el - 1];
      let progressCont = document.querySelector(`.skills .el${el}`);

      let progressEl = setInterval(() => {
        progressVal++;
        progressCont.style.background = `conic-gradient( 
          #58f198 ${progressVal}%,
          #58f1984d ${progressVal + 10}%
      )`;

        if (progressVal == endVal) {
          clearInterval(progressEl);
        }
      }, speed);

      if (el >= 12) {
        clearInterval(progress);
      }
    }, intDur);

    let elDu = 0;
    let progressDu = setInterval(() => {
      elDu++;
      let endDuVal = progressEndVal[elDu - 1];
      let progressDuCont = document.querySelector(`.skills .inner .du${elDu}`);

      progressDuCont.style.background = `conic-gradient( 
          #58f198 ${endDuVal}%,
          #58f1984d ${endDuVal + 10}%)`;

      if (elDu >= 12) {
        clearInterval(progressDu);
      }
    });
  }
});

let skills = document.querySelector(".skills");

function inView(element) {
  var bounding = element.getBoundingClientRect();

  if (
    bounding.top >= 0 &&
    bounding.left >= 0 &&
    bounding.right <=
      (window.innerWidth || document.documentElement.clientWidth) &&
    bounding.bottom <=
      (window.innerHeight || document.documentElement.clientHeight)
  ) {
    return true;
  } else {
    return false;
  }
}

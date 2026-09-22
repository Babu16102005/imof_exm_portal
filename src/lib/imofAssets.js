/**
 * Central accessor for locally mirrored IMOF website assets.
 * All files live under `public/assets/imof/` (Vite public → served at `/assets/imof/...`).
 * No runtime fetch to imofedu.com. Use absolute paths (leading slash) so nested
 * React Router routes (e.g. `/my-exams`) resolve correctly.
 */
const ROOT = '/assets/imof'

export const IMOF_ASSETS = {
  brand: {
    logo: `${ROOT}/brand/logo.png`,
    transparentLogo: `${ROOT}/brand/transparent-logo.png`,
    ogCover: `${ROOT}/brand/imof_colo.jpg`,
  },
  hero: {
    s1: `${ROOT}/hero/S1.jpg`,
    s2: `${ROOT}/hero/S2.jpg`,
    s3: `${ROOT}/hero/S3.jpg`,
    s4: `${ROOT}/hero/S4.jpg`,
    all: [`${ROOT}/hero/S1.jpg`, `${ROOT}/hero/S2.jpg`, `${ROOT}/hero/S3.jpg`, `${ROOT}/hero/S4.jpg`],
  },
  icons: {
    languages: `${ROOT}/icons/languages.png`,
    maths: `${ROOT}/icons/maths.png`,
    designThinking: `${ROOT}/icons/design-thinking.png`,
    laptopComputer: `${ROOT}/icons/laptop-computer.png`,
    playtime: `${ROOT}/icons/playtime.png`,
    brush: `${ROOT}/icons/brush.png`,
    scientist: `${ROOT}/icons/scientist.png`,
    think: `${ROOT}/icons/think.png`,
    science: `${ROOT}/icons/science.png`,
    chemistry: `${ROOT}/icons/chemistry.png`,
    biology: `${ROOT}/icons/biology.png`,
  },
  gifs: {
    onlineSecurity: `${ROOT}/gifs/online-security.gif`,
    chemistry: `${ROOT}/gifs/chemistry.gif`,
    maths: `${ROOT}/gifs/maths.gif`,
    idea: `${ROOT}/gifs/idea.gif`,
    book: `${ROOT}/gifs/book.gif`,
    physics: `${ROOT}/gifs/physics.gif`,
    paintPalette: `${ROOT}/gifs/paint-palette.gif`,
    destination: `${ROOT}/gifs/destination.gif`,
    blackboard: `${ROOT}/gifs/blackboard.gif`,
  },
  stats: {
    s2740: `${ROOT}/stats/1629972740.png`,
    s2788: `${ROOT}/stats/1629972788.png`,
    s2810: `${ROOT}/stats/1629972810.png`,
    s2828: `${ROOT}/stats/1629972828.png`,
    s2845: `${ROOT}/stats/1629972845.png`,
    s2860: `${ROOT}/stats/1629972860.png`,
  },
  partners: {
    par01: `${ROOT}/partners/Par01.png`,
    par02: `${ROOT}/partners/Par02.jpg`,
    par03: `${ROOT}/partners/Par03.png`,
    par04: `${ROOT}/partners/Par04.png`,
    par05: `${ROOT}/partners/Par05.png`,
    par06: `${ROOT}/partners/Par06.png`,
  },
  testimonials: {
    schoolboys: `${ROOT}/testimonials/schoolboys-lesson.jpg`,
    chemistryClass: `${ROOT}/testimonials/boy-learning-more-about-chemistry-class.jpg`,
    avatar: `${ROOT}/testimonials/learn-ico.png`,
  },
}

export default IMOF_ASSETS

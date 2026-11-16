/* The cats a player can choose. A cat's id is `${breed}-${coat}` and its art
   lives in assets/cats/<id>/ : sit, squat, sleep, happy, eat, loaf, groom,
   yawn and walk-1..4 (.png), all drawn to the same layout as the first cat.
   `ready` flips to true once that folder exists; the picker shows the rest as
   coming soon. `swatch` is the coat colour shown before the art is loaded. */
window.CATS = [
  { breed: 'domestic', breedName: '中华田园猫', coats: [
    { coat: 'orange', name: '橘猫', swatch: '#f0a03c', ready: true },
    { coat: 'calico', name: '三花', swatch: '#e8b06a', ready: true },
    { coat: 'cow', name: '奶牛猫', swatch: '#3b3b3b', ready: true },
  ] },
  { breed: 'british', breedName: '英短', coats: [
    { coat: 'blue', name: '蓝猫', swatch: '#8e9aa6', ready: true },
    { coat: 'bluewhite', name: '蓝白', swatch: '#aab4be', ready: true },
  ] },
  { breed: 'ragdoll', breedName: '布偶猫', coats: [
    { coat: 'seal', name: '海豹双色', swatch: '#8a6a55', ready: true },
    { coat: 'blue', name: '蓝双色', swatch: '#a9b0b8', ready: true },
  ] },
  { breed: 'siamese', breedName: '暹罗猫', coats: [
    { coat: 'seal', name: '海豹重点', swatch: '#5b4436', ready: true },
    { coat: 'blue', name: '蓝重点', swatch: '#8d949c', ready: true },
  ] },
  { breed: 'silver', breedName: '银渐层', coats: [
    { coat: 'shaded', name: '银渐层', swatch: '#cfd3d6', ready: false },
    { coat: 'tipped', name: '银点', swatch: '#e6e8ea', ready: true },
  ] },
  { breed: 'golden', breedName: '金渐层', coats: [
    { coat: 'shaded', name: '金渐层', swatch: '#d9a55a', ready: false },
    { coat: 'tipped', name: '金点', swatch: '#e9c98b', ready: true },
  ] },
  { breed: 'bengal', breedName: '豹猫', coats: [
    { coat: 'brown', name: '金豹', swatch: '#c98a3e', ready: true },
    { coat: 'snow', name: '雪豹', swatch: '#e7dccb', ready: true },
    { coat: 'silver', name: '银豹', swatch: '#b9bdc2', ready: true },
  ] },
  { breed: 'american', breedName: '美短', coats: [
    { coat: 'silver', name: '银虎斑', swatch: '#b4b8bc', ready: true },
    { coat: 'brown', name: '棕虎斑', swatch: '#9a7650', ready: true },
  ] },
  { breed: 'sphynx', breedName: '司芬克斯', coats: [
    { coat: 'pink', name: '粉肤', swatch: '#e9c2b4', ready: true },
    { coat: 'grey', name: '灰肤', swatch: '#a7a2a4', ready: true },
  ] },
  { breed: 'abyssinian', breedName: '阿比西尼亚', coats: [
    { coat: 'ruddy', name: '红褐', swatch: '#b9703a', ready: false },
    { coat: 'blue', name: '蓝色', swatch: '#9aa0a8', ready: false },
    { coat: 'fawn', name: '浅褐', swatch: '#d9b89a', ready: false },
  ] },
  { breed: 'persian', breedName: '波斯猫', coats: [
    { coat: 'white', name: '纯白', swatch: '#f4f1ea', ready: true },
    { coat: 'cream', name: '奶油', swatch: '#ecd9b6', ready: true },
  ] },
  { breed: 'devon', breedName: '德文', coats: [
    { coat: 'white', name: '白色', swatch: '#f1eee8', ready: true },
    { coat: 'smoke', name: '黑烟', swatch: '#4a4648', ready: false },
    { coat: 'tabby', name: '虎斑', swatch: '#a98a68', ready: false },
  ] },
];

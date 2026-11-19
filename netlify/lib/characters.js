// Từ điển nhận diện nhân vật phổ biến & tự sửa lỗi chính tả cho MomentBox
// Giúp AI vẽ đúng ngoại hình ngay cả khi khách gõ sai chính tả hoặc thiếu tên series

const KNOWN_CHARACTERS = [
  {
    re: /\bleon\s*(?:s\.?)?\s*ken+ed[yi]\b|\bleon\s*re4\b/i,
    canonicalName: 'Leon S. Kennedy',
    franchise: 'Resident Evil 4',
    visualSpec:
      'Leon S. Kennedy from Resident Evil 4: handsome young man with parted sandy-brown feathered hair, sharp blue-grey eyes, determined expression, wearing a brown shearling-collar leather jacket over a navy tactical shirt, dark utility trousers, leather belt, and holding a sleek tactical flashlight',
    sceneTheme: 'atmospheric European village stone arch, warm amber lantern glow, and layered charcoal-navy 3D paper backdrop',
  },
  {
    re: /\bluf+y\b|\bmokey\s*d\.?\s*luf+y\b|\bmonkey\s*d\.?\s*luf+y\b/i,
    canonicalName: 'Monkey D. Luffy',
    franchise: 'One Piece',
    visualSpec:
      'Monkey D. Luffy from One Piece: energetic cheerful boy with messy black hair, iconic yellow straw hat with red ribbon band, small scar under left eye, bright big grin, wearing an open red vest-jacket, blue denim shorts, yellow sash, and sandals',
    sceneTheme: 'sunny ocean wave paper cutouts, wooden ship deck railing, treasure chest, and sky-blue layered 3D paper backdrop',
  },
  {
    re: /\bzor+o\b|\broronoa\b/i,
    canonicalName: 'Roronoa Zoro',
    franchise: 'One Piece',
    visualSpec:
      'Roronoa Zoro from One Piece: muscular swordsman with spiky moss-green hair, thin scar across his left eye, wearing a dark green open long coat tied with a red waist sash, three ornamental katana scabbards tucked at his waist, confident smirk',
    sceneTheme: 'emerald bamboo forest silhouettes, swirling wind ribbons, and mint-green layered 3D paper stage',
  },
  {
    re: /\bnarut+o+\b/i,
    canonicalName: 'Naruto Uzumaki',
    franchise: 'Naruto',
    visualSpec:
      'Naruto Uzumaki from Naruto: energetic teen ninja with spiky golden-blonde hair, whisker marks on both cheeks, bright blue eyes, wearing a navy forehead headband, bright orange and black zippered ninja tracksuit, holding a glowing blue energy orb in his palm',
    sceneTheme: 'hidden leaf village rooftop silhouettes, swirling orange cloud layers, and warm sunset gold 3D paper diorama',
  },
  {
    re: /\bsasuke\b/i,
    canonicalName: 'Sasuke Uchiha',
    franchise: 'Naruto',
    visualSpec:
      'Sasuke Uchiha from Naruto: cool young ninja with spiky raven-black hair framing his face, dark eyes, wearing a high-collar navy-blue shirt, purple rope belt, and dark pants, calm composed pose',
    sceneTheme: 'moonlit Japanese torii gate silhouette, dark indigo clouds, and silver crescent moon 3D paper layers',
  },
  {
    re: /\bgoj[ou]\b|\bsatoru\b/i,
    canonicalName: 'Gojo Satoru',
    franchise: 'Jujutsu Kaisen',
    visualSpec:
      'Gojo Satoru from Jujutsu Kaisen: tall stylish sorcerer with spiky snow-white hair, black blindfold or dark round sunglasses revealing glowing ice-blue eyes, wearing a sleek dark navy high-collar jacket and dark trousers, playful confident pose',
    sceneTheme: 'celestial starry sky cutouts, glowing azure geometric rings, and deep indigo-white 3D paper layers',
  },
  {
    re: /\btanjiro\b/i,
    canonicalName: 'Tanjiro Kamado',
    franchise: 'Demon Slayer',
    visualSpec:
      'Tanjiro Kamado from Demon Slayer: kind-hearted boy with tousled dark burgundy hair, forehead scar, hanafuda earrings, wearing a black uniform under a green-and-black checkered haori coat',
    sceneTheme: 'traditional Japanese cherry blossom arch, swirling blue water wave paper layers, and warm lantern accents',
  },
  {
    re: /\bnezuko\b/i,
    canonicalName: 'Nezuko Kamado',
    franchise: 'Demon Slayer',
    visualSpec:
      'Nezuko Kamado from Demon Slayer: sweet girl with long wavy black hair tipped with orange, pink eyes, small bamboo accessory, wearing a pale pink kimono with hemp-leaf pattern and a dark brown haori coat',
    sceneTheme: 'pink sakura blossom petals, bamboo frame cutouts, and soft blush-pink 3D paper diorama',
  },
  {
    re: /\bconan\b|\bedogawa\b/i,
    canonicalName: 'Conan Edogawa',
    franchise: 'Detective Conan',
    visualSpec:
      'Conan Edogawa from Detective Conan: clever young detective with messy brown hair and cowlick, large round eyeglasses, wearing a classic blue school blazer, white shirt, bright red bow tie, grey shorts, and red sneakers, holding a magnifying glass',
    sceneTheme: 'brick detective office arch, gears, magnifying glass cutouts, and navy-crimson 3D paper backdrop',
  },
  {
    re: /\bdor[ae]emon\b|\bđôrêmon\b/i,
    canonicalName: 'Doraemon',
    franchise: 'Doraemon',
    visualSpec:
      'Doraemon: iconic round blue-and-white robotic cat character with a bright red collar and golden bell, white 4D front pocket, red round nose, whiskers, cheerful smile, waving happily',
    sceneTheme: 'fluffy white clouds, sky-blue paper layers, miniature dorayaki pastries, and pastel pink door cutout',
  },
  {
    re: /\bgoku\b|\bsongoku\b|\bson\s*goku\b/i,
    canonicalName: 'Son Goku',
    franchise: 'Dragon Ball',
    visualSpec:
      'Son Goku from Dragon Ball: martial artist with iconic wild spiky jet-black hair, cheerful confident expression, wearing an orange martial arts gi with blue undershirt, blue belt, and blue wristbands',
    sceneTheme: 'golden nimbus clouds, floating dragon-star spheres, and warm orange-gold 3D paper layers',
  },
  {
    re: /\blevi\b|\backerman\b/i,
    canonicalName: 'Levi Ackerman',
    franchise: 'Attack on Titan',
    visualSpec:
      'Levi Ackerman from Attack on Titan: sharp-eyed young man with sleek black undercut hair, calm stoic expression, wearing a crisp white cravat, short brown Survey Corps jacket with wing emblem, and green cape',
    sceneTheme: 'stone fortress arch, emerald forest silhouettes, and muted olive-cream 3D paper layers',
  },
  {
    re: /\bspider[- ]?man\b|\bpeter\s*parker\b/i,
    canonicalName: 'Spider-Man',
    franchise: 'Marvel',
    visualSpec:
      'Spider-Man: iconic superhero wearing the vibrant red-and-blue webbed full-body suit with crisp white expressive eye lenses and black spider chest emblem, agile dynamic pose',
    sceneTheme: 'stylized city skyline paper silhouettes, subtle web cutouts, and vibrant sky-red 3D paper backdrop',
  },
  {
    re: /\biron\s*man\b|\btony\s*stark\b/i,
    canonicalName: 'Iron Man',
    franchise: 'Marvel',
    visualSpec:
      'Iron Man: sleek futuristic red-and-gold metallic armor suit with glowing cyan-blue circular arc reactor on the chest and glowing eye slits, heroic hovering pose',
    sceneTheme: 'sleek futuristic tech hexagon cutouts, warm gold accent rings, and clean metallic-ivory 3D paper backdrop',
  },
  {
    re: /\bbatman\b|\bbruce\s*wayne\b/i,
    canonicalName: 'Batman',
    franchise: 'DC Comics',
    visualSpec:
      'Batman: dark-armored superhero wearing a matte charcoal-grey armored suit, black bat chest emblem, utility gold belt, flowing black cape, and pointed bat cowl',
    sceneTheme: 'moonlit Gotham gothic skyline paper layers, subtle spotlight beam, and slate-gold 3D paper diorama',
  },
  {
    re: /\byasuo\b/i,
    canonicalName: 'Yasuo',
    franchise: 'League of Legends',
    visualSpec:
      'Yasuo from League of Legends: wandering wind samurai with long spiky dark-brown hair tied in a high ponytail, scar across nose, wearing blue-and-brown armor shoulder guard, flowing scarf, and holding a sleek ceremonial wind staff',
    sceneTheme: 'drifting sakura petals, swirling silver wind ribbons, and slate-blue 3D paper diorama',
  },
  {
    re: /\bpikachu\b/i,
    canonicalName: 'Pikachu',
    franchise: 'Pokemon',
    visualSpec:
      'Pikachu from Pokemon: adorable bright-yellow electric mouse mascot with long black-tipped ears, rosy red cheek circles, dark bright eyes, and lightning-bolt shaped tail, cheerful pose',
    sceneTheme: 'sunny meadow paper hills, lightning star cutouts, and cheerful pastel yellow-mint 3D paper layers',
  },
  {
    re: /\bharry\s*potter\b/i,
    canonicalName: 'Harry Potter',
    franchise: 'Harry Potter',
    visualSpec:
      'Harry Potter: young wizard with messy dark hair, round wire-rimmed glasses, tiny lightning forehead scar, wearing a black Hogwarts wizard robe with burgundy-and-gold striped scarf, holding a wooden magic wand',
    sceneTheme: 'magical castle archway silhouettes, floating golden stars, and burgundy-gold 3D paper diorama',
  },
]

const matchKnownCharacter = (requests) => {
  const joined = Array.isArray(requests) ? requests.join(' ') : String(requests || '')
  return KNOWN_CHARACTERS.find((item) => item.re.test(joined)) || null
}

module.exports = { KNOWN_CHARACTERS, matchKnownCharacter }

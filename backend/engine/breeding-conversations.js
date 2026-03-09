/**
 * Breeding Conversation Templates v2
 * 
 * Connected conversation flows for natural WhatsApp breeding.
 * Each template is a back-and-forth dialogue between person A and B.
 * Messages alternate: A→B, B→A, A→B, B→A, etc.
 * 
 * Placeholders: {{time}}, {{place}}, {{food}}, {{name}}, {{day}}, {{price}}, {{movie}}, {{city}}
 * Spin syntax: {opsi1|opsi2|opsi3} — randomly picks one option per conversation
 */

// ============================================================
// Substitution variable pools
// ============================================================

const substitutions = {
  time: [
    'jam 12', 'jam 1 siang', 'jam 7 malem', 'jam 3 sore', 'jam 6 sore',
    'jam 8 malem', 'jam 12.30', 'jam 11 siang', 'jam 5 sore', 'jam 9 pagi',
    'jam 10 pagi', 'jam 2 siang', 'jam 4 sore', 'setengah 1', 'jam 7.30'
  ],
  place: [
    'Senayan', 'GI', 'mall deket rumah', 'Kemang', 'PIK', 'Kelapa Gading',
    'Sudirman', 'Pondok Indah', 'BSD', 'Bintaro', 'Menteng', 'Citos',
    'Sarinah', 'Central Park', 'Lippo Mall', 'Kota Kasablanka', 'Blok M'
  ],
  food: [
    'nasi goreng', 'sate', 'bakso', 'ramen', 'mie ayam', 'nasi padang',
    'sushi', 'pizza', 'burger', 'ayam geprek', 'soto', 'gado-gado',
    'martabak', 'nasi uduk', 'pempek', 'rendang', 'kwetiau', 'dim sum',
    'seafood', 'steak'
  ],
  name: [
    'bro', 'sis', 'bang', 'kak', 'cuy', 'bestie', 'guys', 'woi',
    'bos', 'gaes', 'njir', 'dude', 'mas', 'mba'
  ],
  day: [
    'Sabtu', 'Minggu', 'besok', 'lusa', 'Jumat', 'weekend', 'Sabtu depan',
    'Minggu depan', 'ntar malem', 'besok sore'
  ],
  price: [
    '50rb', '75rb', '100rb', '150rb', '200rb', '35rb', '80rb', '120rb',
    '25rb', '250rb', '300rb', '45rb'
  ],
  movie: [
    'film Marvel baru', 'Oppenheimer', 'film horror Korea', 'Godzilla',
    'film Netflix yg itu', 'Spiderman', 'film anime yg lg rame', 'John Wick',
    'Dune', 'film Indonesia yg baru', 'Avengers', 'One Piece Film Red'
  ],
  city: [
    'Bali', 'Jogja', 'Bandung', 'Malang', 'Lombok', 'Semarang',
    'Surabaya', 'Medan', 'Raja Ampat', 'Labuan Bajo'
  ],
  game: [
    'Valorant', 'Mobile Legends', 'Roblox', 'Minecraft', 'PUBG Mobile',
    'Free Fire', 'Genshin Impact', 'Honkai Star Rail', 'Apex Legends',
    'FIFA', 'eFootball', 'Among Us', 'Stumble Guys', 'Fortnite'
  ],
  rank_valo: [
    'Iron 3', 'Bronze 2', 'Silver 1', 'Silver 3', 'Gold 1', 'Gold 2', 'Gold 3',
    'Platinum 1', 'Platinum 2', 'Diamond 1'
  ],
  rank_ml: [
    'Grandmaster', 'Epic 3', 'Epic 1', 'Legend 5', 'Legend 3', 'Legend 1',
    'Mythic', 'Mythic 2', 'Mythical Glory'
  ],
  hero_ml: [
    'Chou', 'Ling', 'Fanny', 'Hayabusa', 'Kagura', 'Lancelot', 'Gusion',
    'Esmeralda', 'Beatrix', 'Wanwan', 'Arlott', 'Xavier', 'Valentina'
  ],
  agent_valo: [
    'Jett', 'Reyna', 'Phoenix', 'Omen', 'Sage', 'Chamber', 'Raze',
    'Sova', 'Killjoy', 'Cypher', 'Viper', 'Gekko', 'Clove', 'Iso'
  ],
  roblox_game: [
    'Blox Fruits', 'Adopt Me', 'Tower of Hell', 'Brookhaven', 'Murder Mystery 2',
    'Arsenal', 'Bee Swarm Simulator', 'King Legacy', 'Pet Simulator X'
  ],
  minecraft_thing: [
    'survival world', 'creative build', 'server SMP', 'modpack baru', 'redstone contraption',
    'netherite armor', 'ender dragon', 'villager trading hall', 'mob farm'
  ],
  youtuber: [
    'Windah Basudara', 'Jess No Limit', 'Frost Diamond', 'MiawAug', 'Erpan1140',
    'Atta Halilintar', 'Ria Ricis', 'Tanboy Kun', 'Jerome Polin', 'Deddy Corbuzier'
  ],
  music: [
    'lagu Tulus yg baru', 'Coldplay', 'Taylor Swift', 'BTS', 'Sheila on 7',
    'Dewa 19', 'Mahalini', 'Juicy Luicy', 'Hindia', 'Nadin Amizah',
    'lagu TikTok yg viral', 'Bernadya', 'Fiersa Besari'
  ]
};

// ============================================================
// Conversation templates
// ============================================================

const conversationTemplates = [
  // 1. Janjian makan
  {
    topic: 'janjian-makan',
    messages: [
      { from: 'A', text: '{{name}} {makan yuk|jalan yuk makan|eh makan bareng yuk} {{day}} 🍽️' },
      { from: 'B', text: '{boleh2 mau makan apa?|yuk mau kemana?|gas! mau makan apa nih?}' },
      { from: 'A', text: '{gmn kalo|mau ga|pengen} {{food}}? {yg di|tempat} {{place}} {enak bgt|mantep bgt|recommended bgt}' },
      { from: 'B', text: '{wah bole juga tuh|ooh boleh2|oke sip}. jam brp?' },
      { from: 'A', text: '{{time}} {bisa ga?|gimana?|oke ga?}' },
      { from: 'B', text: '{oke sip gw otw ya ntar|gas lah jam segitu gw free|bisa2 ntar gw langsung kesana} 👍' },
    ]
  },

  // 2. Tanya kabar
  {
    topic: 'tanya-kabar',
    messages: [
      { from: 'A', text: '{eh|heh|woi} {{name}} {lg apa?|apa kabar?|sehat ga?} {lama bgt ga ketemu|udah lama bgt nih|kangen gw} wkwk' },
      { from: 'B', text: '{haha iya nih sibuk bgt kerja|wkwk iya nih gw jg sibuk bgt|ehh iya lama ya}. {lu gmn?|lu apa kabar?|gimana lu?}' },
      { from: 'A', text: '{sama aja sih gw juga hectic|biasa lah kerja terus|lumayan sih gw}. {kangen ngumpul dah|kapan kumpul lg|yuk ketemu dong} 😂' },
      { from: 'B', text: '{yuk lah kapan2 ngumpul lg|ayo dong gw juga kangen|gas lah!}. {{day}} {free ga lu?|bisa ga?|ada waktu?}' },
      { from: 'A', text: '{harusnya bisa sih|gw usahain deh|kayaknya bisa}. {ntar gw kabarin ya|gw confirm ntar|bentar gw cek jadwal}' },
      { from: 'B', text: '{oke ditunggu yaa|sip2 kabarin ya|oke gw tunggu} {🙏|👍|😄}' },
    ]
  },

  // 3. Sharing link lucu
  {
    topic: 'link-lucu',
    messages: [
      { from: 'A', text: '{{name}} {udah liat video yg lg viral blm|coba liat ini deh|ada video kocak bgt}?? 😂😂' },
      { from: 'B', text: '{yg mana??|blm liat nih|apaan?? mana??}' },
      { from: 'A', text: '{yg orang jatoh dari motor terus kucing nya malah naik|yg bayi ketawa liat ayam|yg kucing berantem sama anjing} wkwkwk' },
      { from: 'B', text: '{WKWKWK|HAHAHAHA|ANJIR 😂} {blm liat nih kirim dong|mana linknya|share dong}' },
      { from: 'A', text: '{bentarrr gw cari lg linknya|bentar ya|coba gw cari dulu}. {td di tiktok|td di ig reels|td di youtube shorts}' },
      { from: 'B', text: '{okee ditunggu|sip kirim ya|cepetan wkwk}. {gw lg butuh hiburan nih sumpah|bosen bgt gw|lagi gabut nih} 😩' },
      { from: 'A', text: '{sama wkwk stress bgt hari ini|haha sama|mood bgt sih} {😂|💀|wkwk}' },
    ]
  },

  // 4. Nanya alamat
  {
    topic: 'nanya-alamat',
    messages: [
      { from: 'A', text: '{{name}} {tau ga alamat|pernah ke|tau jalan ke} {{place}} {yg baru?|ga?|yg itu?}' },
      { from: 'B', text: '{yg mana?|oh yg itu?|hmm} {yg di deket jalan besar itu?|yg baru buka?|yg rame itu?}' },
      { from: 'A', text: '{iya itu|bener}. {gw mau kesana tp bingung arahnya|ga tau jalannya nih|belom pernah kesana}' },
      { from: 'B', text: '{ooh dari arah sini lu belok kiri abis lampu merah|lu pake google maps aja gampang|gw share pin loc ya}. {ntar ada di sebelah kanan|ga bakal nyasar kok|gampang kok}' },
      { from: 'A', text: '{oke makasih banyak|thanks ya|siap makasih} {{name}} 🙏' },
      { from: 'B', text: '{sama2 hati2 di jalan ya|sip no problem|santai bro} {👍|😊}' },
    ]
  },

  // 5. Rencana weekend
  {
    topic: 'rencana-weekend',
    messages: [
      { from: 'A', text: '{weekend ini ada acara ga|ada plan ga weekend|mau ngapain weekend} {{name}}?' },
      { from: 'B', text: '{blm ada sih|kosong nih|belom ada plan}. {knp emang?|ada apa?|mau ngapain?}' },
      { from: 'A', text: '{mau ga kita ke|yuk ke|gimana kalo ke} {{place}}? {pengen jalan2 aja gtu|bosen di rumah|refreshing dikit}' },
      { from: 'B', text: '{ooh boleh2|gas lah|yuk!}. {naik apa kesana?|berangkat jam brp?|gimana kesananya?}' },
      { from: 'A', text: '{gw bawa mobil aja|naik motor aja|grab aja}. {lu gw jemput|ketemuan aja di|bareng aja dr} {{time}}' },
      { from: 'B', text: '{gas lah|oke deal|sip!}. {jgn lupa ya wkwk|jangan molor ya|awas telat} {😂|wkwk}' },
      { from: 'A', text: '{siap gw set alarm|tenang gw pasti on time|insyaallah ga telat} 💪' },
    ]
  },

  // 6. Belanja online / promo
  {
    topic: 'belanja-promo',
    messages: [
      { from: 'A', text: '{{name}} {tau ga|eh|woi} {Shopee|Tokopedia|Lazada} {lg ada promo gede bgt|lg sale besar2an|diskonnya gila} 😱' },
      { from: 'B', text: '{seriusan??|masa sih?|hah beneran?} {promo apa??|diskon apa??|yg mana?}' },
      { from: 'A', text: '{diskon sampe 70%|cashback 50%|flash sale gila} buat {elektronik|fashion|gadget}. gw baru beli {headset|sepatu|kaos} cuma {{price}}' },
      { from: 'B', text: '{gila murah bgt!|anjir segitu doang?|serius segitu?} {link dong|mana linknya|share dong}' },
      { from: 'A', text: '{bentar ya gw share|nih gw kirim|cek ya}. {cepetan sebelum abis|buruan limited stock|keburu sold out}' },
      { from: 'B', text: '{okee gw standby nih|siap gw checkout skrg|gas langsung beli} wkwk 🛒' },
    ]
  },

  // 7. Ngomongin bola
  {
    topic: 'ngomongin-bola',
    messages: [
      { from: 'A', text: '{nonton bola semalem ga|liat match tadi ga|gila pertandingan semalem} {{name}}?? {gila bgt pertandingannya|seru bgt|dramatis bgt}' },
      { from: 'B', text: '{nonton dong!|iya gw nonton|pasti lah!} {gol terakhir itu bikin gw teriak2|last minute goal nya gila|comeback nya epic bgt} wkwk' },
      { from: 'A', text: '{sama!!|WKWK iya|gila bener} {tetangga gw sampe ngetok pintu|sampe kebangunin adek gw|suara gw pecah} 😂' },
      { from: 'B', text: '{hahahaha|wkwkwk|anjir}. {eh tp wasitnya kontol bgt ga sih|tp keputusan wasitnya aneh ga sih|VARnya ngaco bgt}' },
      { from: 'A', text: '{bener bgt|setuju!|emang}. {harusnya itu penalti jelas2|offside dari mana coba|kartu merah harusnya}' },
      { from: 'B', text: '{udah lah emang wasit EPL suka random|sabar aja deh|gabisa ngapa2in sih}. match {besok|weekend|ntar malem} lu nonton ga?' },
      { from: 'A', text: '{pasti nonton lah|wajib!|ya iyalah}. {nobar yuk di tempat biasa|bareng yuk|mau nobar ga?}' },
      { from: 'B', text: '{gasss|sikat!|lets go} 🔥' },
    ]
  },

  // 8. Minta tolong kecil
  {
    topic: 'minta-tolong',
    messages: [
      { from: 'A', text: '{{name}} {boleh minta tolong ga?|bisa bantuin ga?|lg free ga?}' },
      { from: 'B', text: '{boleh apa|bisa kok|kenapa} {{name}}?' },
      { from: 'A', text: '{bisa ga tolongin gw beliin|lu bisa beliin gw|tolong beliin dong} {{food}} {di deket rumah lu?|yg di {{place}}?} {ntar gw transfer|gw bayarin ntar}' },
      { from: 'B', text: '{ohh bisa kok|oke bisa|boleh}. {mau brp porsi?|brp banyak?|1 aja?}' },
      { from: 'A', text: '{2 porsi aja|1 aja cukup|3 ya}. {brp duit kira2?|brp nih?|perlu transfer brp?}' },
      { from: 'B', text: '{sekitar|kurang lebih|kira2} {{price}} {kali ya per porsi|an|sih}. {ntar gw beliin pulang kerja|gw beliin ntar sore|bentar ya gw beliin}' },
      { from: 'A', text: '{makasih bgt|thanks banyak|lu emg paling bisa diandalin} {{name}} {🙏❤️|🙏|❤️}' },
    ]
  },

  // 9. Ucapan ulang tahun
  {
    topic: 'ultah',
    messages: [
      { from: 'A', text: '{HAPPY BIRTHDAY|HBD|SELAMAT ULANG TAHUN} {{name}}!! 🎂🎉🥳' },
      { from: 'B', text: '{waahh makasih banyak|thanksss|astaga makasih} {{name}}!! ❤️' },
      { from: 'A', text: '{wish u all the best ya|semoga panjang umur|pokoknya semoga makin sukses}. {sehat terus, sukses|lancar rejekinya|tercapai semua impiannya} 🤲' },
      { from: 'B', text: '{aamiin aamiin|aamiin makasih doanya|aamiin ya Allah} 🥹' },
      { from: 'A', text: '{traktir dong wkwk|kpn nih traktiran|ditunggu traktirannya ya} 😂' },
      { from: 'B', text: '{haha bisa aja lu|wkwk pasti|iya2 ntar}. yuk {{day}} {makan|dinner|lunch} {{food}} {gw yg bayar|gw traktir}' },
      { from: 'A', text: '{seriusan??|gasss lah|asikk} 🤩' },
    ]
  },

  // 10. Gossip / curhat ringan
  {
    topic: 'gossip',
    messages: [
      { from: 'A', text: '{{name}} {tau ga|eh|psst} gw td {liat si itu|ketemu someone|liat org yg kita kenal} di {{place}} 👀' },
      { from: 'B', text: '{hah siapa??|who?!|wah siapa?} {spill dong|cerita dong|kasih tau}' },
      { from: 'A', text: '{itu loh yg dulu sering nongkrong bareng kita|yg dulu sekelas sama kita|yg pernah naksir lu dulu wkwk}. {lg sama org baru|lg date kayaknya|lg jalan sama cewe/cowo baru}' },
      { from: 'B', text: '{omaigat seriusan?!|hah beneran?|APAA?!} {bukannya dia masih sama yg lama??|katanya kan udah nikah?|wah drama nih}' },
      { from: 'A', text: '{gatau deh|entah ya|yg gw tau sih} tp {keliatan mesra bgt sih|pegangan tangan|ketawa2 terus} wkwk' },
      { from: 'B', text: '{waduh drama bgt|rame nih|hot gossip} 🍿 {update terus ya kalo ada info baru|kabarin gw ya|jangan lupa update}' },
    ]
  },

  // 11. Nanya rekomendasi resto
  {
    topic: 'rekomendasi',
    messages: [
      { from: 'A', text: '{{name}} {tau tempat makan enak|ada rekomendasi resto|tau tempat yg bagus} di {daerah|sekitar|area} {{place}} ga?' },
      { from: 'B', text: '{hmm banyak sih|ada nih|tau dong}. {lu mau makan apa?|budget brp?|cari yg gimana?}' },
      { from: 'A', text: '{pengen|mau|lagi craving} {{food}} {yg enak|yg mantep|yg worth it}. budget {{price}}an {per orang|an lah}' },
      { from: 'B', text: '{coba yg di sebelah mall itu deh|ada nih tempat recommended|gw tau satu tempat}. {enak bgt porsinya gede|murah tp rame terus|worth it bgt}' },
      { from: 'A', text: '{ooh yg itu ya?|dimana tepatnya?|ooh} {ratingnya bagus ga?|rame ga?|enak beneran?}' },
      { from: 'B', text: '{bagus kok 4.5 di Google|4.8 rating di Grab|reviewnya bagus2}. {gw udah 3x kesana|langganan gw itu|ga pernah mengecewakan} wkwk' },
      { from: 'A', text: '{oke deh ntar gw coba|gas kesana deh|sip gw coba}. thanks {{name}} 👍' },
    ]
  },

  // 12. Kerjaan kantor
  {
    topic: 'kerjaan',
    messages: [
      { from: 'A', text: '{{name}} {deadline project lu kapan?|gimana kerjaan lu?|masih sibuk ga?}' },
      { from: 'B', text: '{{day}} {ini|depan} 😭 {belom selesai lagi|masih banyak yg harus dibenerin|ribet bgt}' },
      { from: 'A', text: '{waduh|duh|wah} {semangat bro|sabar ya|keep going}. {butuh bantuan ga?|bisa gw bantuin?|mau gw bantu?}' },
      { from: 'B', text: '{boleh sih|mau bgt|tolong dong} {kalo lu bisa review presentasi gw bentar|bantuin cek data gw|kasih feedback dong}' },
      { from: 'A', text: '{bisa2|oke|boleh} {kirim aja ntar malem gw liat|share aja gw cek|kirim ke email gw ya}' },
      { from: 'B', text: '{thanksss bgt|lu penyelamat|makasih banyak} {{name}} {😭🙏|🙏|❤️}' },
    ]
  },

  // 13. Traveling plan
  {
    topic: 'traveling',
    messages: [
      { from: 'A', text: '{{name}} {bulan depan|liburan ntar|long weekend} {jadi ga kita ke|yuk ke|gimana rencana ke} {{city}}? ✈️' },
      { from: 'B', text: '{jadi dong!|insyaallah jadi|gw mau bgt!} {gw udah cek tiket pesawat nih|lg cari tiket nih|tiketnya lg murah}' },
      { from: 'A', text: '{brp dapet?|harganya brp?|murah ga?} {gw liat kemarin lumayan murah|lg promo kan?|gw jg lg cek nih}' },
      { from: 'B', text: '{dapet|dpt|cuma} {{price}} {pp|pulang pergi}. {cepet booking deh sebelum naik|buruan deh|grab sekarang}' },
      { from: 'A', text: '{oke gw booking skrg|gas gw beli|sip gw langsung book}. {hotel udah book blm?|penginapan gimana?|nginep dimana?}' },
      { from: 'B', text: '{belom nih|lg cari juga|blm}. mau {yg deket pantai|yg di tengah kota|yg murah aja|villa}?' },
      { from: 'A', text: '{deket pantai aja biar vibes liburannya dapet|villa aja biar private|yg strategic aja biar gampang kemana2} wkwk 🏖️' },
      { from: 'B', text: '{setuju!|oke deal!|gas!} {gw cari ya ntar gw share opsinya|gw booking deh|gw cek Traveloka dulu}' },
    ]
  },

  // 14. Ngomongin cuaca
  {
    topic: 'cuaca',
    messages: [
      { from: 'A', text: '{gila|anjir|duh} {panas bgt|gerah bgt|terik bgt} hari ini {ga sih|ya|cuy} 🥵' },
      { from: 'B', text: '{iya anjir|banget!|parah} gw {keringetan mulu|ga kuat|udah mandi 3x} padahal {di dalem ruangan|pake AC|ga ngapa2in}' },
      { from: 'A', text: '{AC kantor lu ga nyala??|kipas angin ga ngaruh ya|minum es mulu gw}' },
      { from: 'B', text: '{nyala tp kayanya ga kuat deh|udah full blast tp tetep panas|iya ga ngaruh}. di tempat lu gmn?' },
      { from: 'A', text: '{sama aja parah|lebih parah malah|ga beda jauh}. {katanya besok bakal ujan sih|semoga besok mendung|cuaca lg extreme emang}' },
      { from: 'B', text: '{mudah2an beneran deh|aamiin|please ujan} {butuh adem|pengen es kelapa|mau mandi terus} 😩' },
    ]
  },

  // 15. Sharing foto
  {
    topic: 'sharing-foto',
    messages: [
      { from: 'A', text: '{{name}} {coba liat foto gw kemarin|liat nih foto gw|kemarin gw foto2} di {{place}} 😍' },
      { from: 'B', text: '{mana??|wah mana|coba liat} {kirim dong|share dong|penasaran}' },
      { from: 'A', text: '{nih ya|cek nih}. {viewnya bagus bgt sunset nya oren gtu|aesthetic bgt tempatnya|pemandangannya gila sih} 🌅' },
      { from: 'B', text: '{anjir keren bgt!!|gila bagus bgt!|ini real ga sih} {pake kamera apa?|pake hp apa?|filter apa?}' },
      { from: 'A', text: '{hp doang kok|no filter|pake iPhone} wkwk. {emang spotnya yg bagus|golden hour sih|lighting nya yg bgs}' },
      { from: 'B', text: '{kapan2 ajak gw dong kesana|gw mau kesana juga|iri bgt gw} 😤' },
      { from: 'A', text: '{boleh2 next time ya kita bareng|yuk kapan2|gas!}' },
    ]
  },

  // 16. Basa-basi tetangga
  {
    topic: 'tetangga',
    messages: [
      { from: 'A', text: '{eh|btw|oi} {{name}} {tau ga|denger ga} tetangga {sebelah rumah gw|depan rumah|blok C} {pindahan|mau pindah}' },
      { from: 'B', text: '{oh yg rumah cat biru itu?|yg mana?|hah serius?} pindah kemana?' },
      { from: 'A', text: '{gatau sih|kayaknya|katanya} ke {{city}} deh. {katanya ikut suami pindah kerja|dapet kerjaan baru|mau deket ortu}' },
      { from: 'B', text: '{oalah pantesan|ooh gitu|hmm} {kemarin gw liat truk angkut barang|rumahnya udah kosong|kok mendadak ya}' },
      { from: 'A', text: '{iya|bener}. {yg gantiin kayanya anak muda deh|belum ada yg gantiin sih|blm tau siapa yg baru}' },
      { from: 'B', text: '{wah semoga tetangga baru nya oke ya|yg penting ga berisik|mudah2an ramah}. {yg lama baik bgt soalnya|sayang juga ya|sedih juga sih}' },
    ]
  },

  // 17. Diskusi gadget
  {
    topic: 'gadget',
    messages: [
      { from: 'A', text: '{{name}} {lu pake hp apa skrg?|hp lu merk apa?|udah ganti hp blm?}' },
      { from: 'B', text: '{masih yg lama nih|Samsung|iPhone}. {emang knp?|ada apa?|lg cari hp?}' },
      { from: 'A', text: '{gw lg nyari hp baru nih|pengen ganti hp|hp gw udah lemot bgt}. {bingung mau iPhone apa Samsung|bingung milih merk|ada rekomendasi?}' },
      { from: 'B', text: '{kalo gw sih prefer Samsung|iPhone menurut gw paling stabil|Xiaomi aja murah tp bagus}. {lebih versatile mnrt gw|kameranya juara|worth it bgt}' },
      { from: 'A', text: '{budget gw sekitar 8jt sih|5 jutaan ada ga?|budget 10jt}. {ada rekomendasi?|seri apa yg bagus?|yg mana ya?}' },
      { from: 'B', text: '{Samsung S series aja|iPhone 15 aja|Pixel bagus tuh}. {kameranya bagus bgt skrg|batrenya awet|performanya mantep}' },
      { from: 'A', text: '{oke deh ntar gw cek|gas gw liat2 deh|sip thanks infonya} ke {{place}}. {thanks ya|makasih} 👍' },
    ]
  },

  // 18. Health / olahraga
  {
    topic: 'olahraga',
    messages: [
      { from: 'A', text: '{{name}} {lu masih rajin gym ga?|masih olahraga ga?|lu masih lari pagi?}' },
      { from: 'B', text: '{masih dong|iya nih rajin|on off sih} 💪 {seminggu 4x|3x seminggu|tiap hari}. lu gmn?' },
      { from: 'A', text: '{gw mau mulai lg nih|udah lama ga olahraga|pengen rajin lg deh} {udah lama ga olahraga|badan udah mulai melar|perut udah gede wkwk} 😅' },
      { from: 'B', text: '{yuk bareng aja|ayo gw temenin|gas lah mulai}. {gw biasa|biasanya} {{day}} {pagi|sore}' },
      { from: 'A', text: '{{time}} {gt?|ya?|bisa?} {ga kesorean?|keburu ga?|masih sempet?}' },
      { from: 'B', text: '{engga kok pas bgt|pas tuh waktunya|perfect timing}. {abis gym bisa sarapan bareng|abis olahraga makan bareng|trs ngopi deh abis itu}' },
      { from: 'A', text: '{deal!|oke sip!|gas!} {mulai minggu depan ya|mulai besok ya|mulai {{day}} ya}' },
      { from: 'B', text: '{siap!|okee|sip!} {jgn mager ya wkwk|awas bolos|jangan cancel} 😂' },
    ]
  },

  // 19. Nanya resep masakan
  {
    topic: 'resep',
    messages: [
      { from: 'A', text: '{{name}} {tau resep|bisa masak|punya resep} {{food}} ga? {yg enak|yg gampang|yg simpel}' },
      { from: 'B', text: '{tau dong!|bisa kok|hmm lumayan}. {lu mau masak sendiri?|mau coba masak?|buat siapa?}' },
      { from: 'A', text: '{iya nih pengen coba2 masak|bosen makan luar terus|mau masak buat pacar wkwk}. {kasih tau dong caranya|gimana step2nya?|ajarin dong}' },
      { from: 'B', text: '{gampang kok|simpel sih|ga susah}. {bahan utamanya tinggal ke pasar aja|cek resep di YouTube jg ada|gw kasih tau ya}' },
      { from: 'A', text: '{trs bumbunya apa aja?|bahan2nya apa?|perlu apa aja?}' },
      { from: 'B', text: '{bawang merah, bawang putih, cabe, kecap|standar sih bumbu dapur|garem gula kecap cabe}. {yg penting apinya jgn kegedean|jangan kelamaan masaknya|aduk terus biar ga gosong}' },
      { from: 'A', text: '{oke noted!|sip gw coba|mantep thanks}. {ntar gw coba ya wish me luck|doain berhasil ya|semoga ga ancur} 🤞😂' },
    ]
  },

  // 20. Random funny story
  {
    topic: 'funny-story',
    messages: [
      { from: 'A', text: '{WKWKWK|HAHAHA|ANJIR} {{name}} {gw baru ngalamin hal kocak bgt|gw mau cerita lucu|ada kejadian absurd td}' },
      { from: 'B', text: '{apaan??|hah knp?|wkwk apa?} {cerita dong|spill|kasih tau}' },
      { from: 'A', text: '{gw td di|bayangin gw di} {{place}} {mau bayar parkir tp dompet ketinggalan di mobil|salah masuk toilet cewe|nabrak pintu kaca} 💀' },
      { from: 'B', text: '{HAHAHA|WKWKWK|YA AMPUN} {trs gimana??|serius?!|anjir memalukan}' },
      { from: 'A', text: '{gw harus balik lg ke mobil yg parkirnya di lantai 5|langsung kabur dong|malu bgt gw pura2 ga liat} wkwkwk' },
      { from: 'B', text: '{ya ampun kasian bgt sih lu|gw kalo jadi lu udah mati gaya|WKWK sumpah lucu bgt} 😂😂' },
      { from: 'A', text: '{udah gitu|parahnya lg} {abang parkirnya ngeliatin gw kayak org aneh|ada yg ngerekam lg|orang2 pada ngeliatin} {😭|💀|wkwk}' },
      { from: 'B', text: '{sabar ya {{name}} wkwk|besok pasti lebih baik|udah lupain aja} 😭' },
    ]
  },

  // ============================================================
  // NEW GAMING TOPICS
  // ============================================================

  // 21. Valorant
  {
    topic: 'valorant',
    messages: [
      { from: 'A', text: '{{name}} {maen Valo ga ntar malem?|ranked Valorant yuk|push rank Valo bareng ga?}' },
      { from: 'B', text: '{yok gas!|boleh2|mau bgt}. {rank lu apa skrg?|udah sampe mana?|masih {{rank_valo}}?}' },
      { from: 'A', text: '{baru|masih|stuck di} {{rank_valo}} {😅|nih|haha}. {susah naik anjir|elo hell bgt|random mulu teammates nya}' },
      { from: 'B', text: '{wkwk sama gw jg stuck|sabar bro|haha classic Valo}. {lu main apa?|agent apa lu?|pake siapa biasanya?}' },
      { from: 'A', text: '{gw main|gw pake|main} {{agent_valo}} {sih|biasanya|doang}. {lu?|lu pake apa?|duo yuk}' },
      { from: 'B', text: '{gw|biasa pake} {{agent_valo}}. {{time}} {ya mulai?|kita start?|on ya?}' },
      { from: 'A', text: '{gas!|sip!|oke} {prepare mental dulu buat kalah wkwk|semoga dapet team bagus|jangan toxic ya} {😂|💀|wkwk}' },
    ]
  },

  // 22. Mobile Legends
  {
    topic: 'mobile-legends',
    messages: [
      { from: 'A', text: '{{name}} {mabar ML yuk!|ranked ML ga ntar?|push Mythic bareng yuk}' },
      { from: 'B', text: '{gas!|yok!|boleh bgt}. {rank lu apa?|udah Mythic blm?|masih Epic?}' },
      { from: 'A', text: '{masih|baru|nyangkut di} {{rank_ml}} {nih|😅|haha stuck bgt}' },
      { from: 'B', text: '{tenang gw carry|wkwk sama|gw jg lg push nih}. {lu pake hero apa?|main role apa?|jago pake apa?}' },
      { from: 'A', text: '{gw jago|andalan gw|main} {{hero_ml}} {sih|biasanya|doang wkwk}. {GG ga?|boleh ga?|cocok ga?}' },
      { from: 'B', text: '{mantep!|bisa bisa|oke cocok} gw {pake|main} {{hero_ml}} {aja|deh}. {ntar malem ya|{{time}} mulai|abis isya gas}' },
      { from: 'A', text: '{sip jangan lupa pake skin biar menang|wkwk gas|oke siap mental ranked} 🔥' },
      { from: 'B', text: '{HAHA skin = skill|bener bgt|mental itu nomor satu di ML} 😂' },
    ]
  },

  // 23. Roblox
  {
    topic: 'roblox',
    messages: [
      { from: 'A', text: '{{name}} {masih main Roblox ga?|eh Roblox yuk|ada game Roblox baru nih}' },
      { from: 'B', text: '{masih dong|iya nih lg sering main|blm main lg sih}. {game apa?|mau main apa?|yg mana?}' },
      { from: 'A', text: '{gw lg addict|lg sering main|coba deh} {{roblox_game}} {seru bgt!|gila asik bgt|nagih parah}' },
      { from: 'B', text: '{wah itu {{roblox_game}}?|ooh yg itu|gw jg pernah main itu}. {emang seru sih|addict bgt|gw dulu main tiap hari}' },
      { from: 'A', text: '{bareng yuk {{time}}|mabar yuk|add gw dong}. {username lu apa?|ID lu brp?|friend gw ya}' },
      { from: 'B', text: '{oke gw add ntar|sip ntar gw online|gas!} {jangan lupa Robux nya wkwk|gratisan aja dulu|VIP server ga?} 😂' },
      { from: 'A', text: '{wkwk duit buat Robux abis terus|udah abis jajan buat Robux|haha iya nih mahal} {💀|😭|wkwk}' },
    ]
  },

  // 24. Minecraft
  {
    topic: 'minecraft',
    messages: [
      { from: 'A', text: '{{name}} {main Minecraft ga?|server MC lu masih aktif?|yuk main MC bareng}' },
      { from: 'B', text: '{masih nih|yok!|lg bikin {{minecraft_thing}} nih}. {lu mau join?|bareng yuk|server gw lg sepi nih}' },
      { from: 'A', text: '{mau!|gas lah|pengen coba} gw {lg bikin|pengen bikin|mau coba} {{minecraft_thing}} {seru bgt|tp susah|blm jadi}' },
      { from: 'B', text: '{gw bantuin deh|gw bisa kasih resource|gw ada tutorial nih}. {survival apa creative?|server SMP?|pake mod ga?}' },
      { from: 'A', text: '{survival dong biar seru|creative aja biar bebas|SMP bareng aja}. {{time}} {on ya?|join ya?|start?}' },
      { from: 'B', text: '{oke gw siapin server|sip!|gas} {jangan grief ya wkwk|bawa diamond banyak|jangan mati di lava lg} {😂|wkwk|💀}' },
    ]
  },

  // 25. PUBG / battle royale
  {
    topic: 'pubg',
    messages: [
      { from: 'A', text: '{{name}} {PUBG yuk!|main PUBG ga?|chicken dinner bareng yuk} 🍗' },
      { from: 'B', text: '{gas!|yok squad|boleh bgt}. {kurang brp org lg?|duo apa squad?|siapa aja?}' },
      { from: 'A', text: '{duo aja|squad tp kurang 2|berdua aja dulu}. {map apa?|Erangel apa Miramar?|mau classic apa TDM?}' },
      { from: 'B', text: '{Erangel classic lah|Sanhok aja biar cepet|terserah lu}. {gw sniper ya|gw rusher|gw support aja}' },
      { from: 'A', text: '{sip gw assault|oke gw flanker|gw driver aja wkwk}. {{time}} {mulai?|start?|gas?}' },
      { from: 'B', text: '{siap!|lets go|gas bro}. {kali ini harus chicken dinner|jangan mati duluan ya|semoga ga ketemu cheater} {😂|🔥|wkwk}' },
    ]
  },

  // 26. Nonton YouTube / streaming
  {
    topic: 'nonton-youtube',
    messages: [
      { from: 'A', text: '{{name}} {udah nonton video|liat ga konten} {{youtuber}} {yg baru?|yg terbaru?|yg kemarin?}' },
      { from: 'B', text: '{udah!|blm nih|yg mana?} {kocak bgt ga sih|seru bgt|gila viewnya banyak bgt}' },
      { from: 'A', text: '{iya gw ngakak bgt|bener sih|emang kontennya makin bagus}. {part yg mana yg lu suka?|favorit lu bagian mana?|endingnya gila ga sih}' },
      { from: 'B', text: '{yg pas dia|bagian waktu|gw suka pas} {jatoh itu WKWK|nge-prank|challenge nya} {lucu bgt|epic bgt|savage}' },
      { from: 'A', text: '{HAHA iya bener|WKWK classic bgt|gw replay 3x bagian itu}. {eh lu subscribe siapa lg?|channel apa lg yg seru?|ada rekomendasi ga?}' },
      { from: 'B', text: '{coba nonton|lu harus cek|recommended bgt} {{youtuber}} {juga seru|jg bagus|kontennya beda}' },
      { from: 'A', text: '{oke ntar gw cek|gas gw subscribe|sip thanks rekomendasinya} 👍' },
    ]
  },

  // 27. Musik / playlist
  {
    topic: 'musik',
    messages: [
      { from: 'A', text: '{{name}} {lg dengerin apa?|playlist lu apa aja?|tau ga} {{music}} {bagus bgt|enak bgt didenger|bikin baper}' },
      { from: 'B', text: '{ooh yg itu|tau!|blm denger nih}. {emang bagus ya?|gw coba denger deh|link dong}' },
      { from: 'A', text: '{bagus bgt sumpah|enak bgt buat kerja|cocok buat galau wkwk}. {lu biasa dengerin apa?|genre apa lu?|spotify apa apple music?}' },
      { from: 'B', text: '{gw lg sering dengerin|lagi addict sama|playlist gw isinya} {{music}} {sih|mulu|akhir2 ini}' },
      { from: 'A', text: '{wah taste lu bagus!|ooh enak jg itu|boleh juga}. {share playlist dong|bikin collaborative playlist yuk|kasih link Spotify lu}' },
      { from: 'B', text: '{oke ntar gw share|gas bikin bareng|sip gw kirim}. {sambil kerja enak bgt|buat di mobil jg cocok|playlist roadtrip ntar} 🎵' },
    ]
  },

  // 28. Genshin Impact / gacha
  {
    topic: 'gacha-game',
    messages: [
      { from: 'A', text: '{{name}} {lu pull ga banner baru?|dapet ga character baru?|udah gacha blm} di {{game}}?' },
      { from: 'B', text: '{DAPET DONG!|blm nih lg nabung primo|gw skip banner ini}. {lu gimana?|lu pull?|dapet ga?}' },
      { from: 'A', text: '{gw {dapet|ga dapet|loss 50/50} 😭|abis {50|80|120} pull {dapet|ga dapet}|primo gw abis anjir}' },
      { from: 'B', text: '{{name}} {sabar ya|F|wkwk RNG emang kejam}. {next banner siapa?|mau pull yg mana lg?|nabung aja dulu}' },
      { from: 'A', text: '{gw mau nabung buat|pengen banget dapet|harus pull} {yg limited ntar|archon yg baru|yg broken itu}' },
      { from: 'B', text: '{semoga dapet ya|gw doain menang 50/50|good luck!} {jangan impulsif pull wkwk|sabar itu kunci gacha|welkin aja dulu biar aman} {😂|🙏|💀}' },
    ]
  },

  // 29. Film / bioskop (expanded)
  {
    topic: 'nonton-film',
    messages: [
      { from: 'A', text: '{{name}} {udah nonton|lu nonton blm} {{movie}} {blm?|ga?|?}' },
      { from: 'B', text: '{belomm|blm sempet|udah!}. {bagus ga emang?|worth it ga?|gimana filmnya?}' },
      { from: 'A', text: '{bagus bgt sumpah|8/10 menurut gw|lumayan sih}. {lu harus nonton deh|recommended bgt|plotnya gila}' },
      { from: 'B', text: '{yuk nonton bareng aja|gw mau nonton jg|gas ke bioskop}. {{day}} {lu free?|bisa?|gimana?}' },
      { from: 'A', text: '{free!|bisa!|hayu}. di {bioskop|XXI|CGV} {{place}} {aja ya|yuk|gimana?}' },
      { from: 'B', text: '{oke|sip|gas}. {gw book tiketnya dulu ya biar ga keabisan|lu book apa gw?|jangan lupa beli popcorn caramel} {🎬|🍿}' },
    ]
  },

  // 30. Curhat kerjaan
  {
    topic: 'curhat-kerja',
    messages: [
      { from: 'A', text: '{duh|aduh|{{name}}} {gw cape bgt sama kerjaan|stress bgt gw|burnout parah nih} 😮‍💨' },
      { from: 'B', text: '{knp emang?|ada apa?|cerita dong}. {bos lu lg ribet ya?|deadline ya?|overwork?}' },
      { from: 'A', text: '{iya nih|bener}. {deadline mepet mulu tp requirement berubah2 terus|kerja lembur mulu|meeting tiap hari capek}' },
      { from: 'B', text: '{classic bgt sih itu|sabar ya|gw paham bgt perasaan lu}. {mau ngopi ga biar agak relax?|healing dulu deh|istirahat bentar}' },
      { from: 'A', text: '{boleh deh|mau bgt|gas lah}. {{day}} {sore abis kerja yuk|pagi sebelum kerja|malem aja}' },
      { from: 'B', text: '{oke|sip} gw tau tempat {ngopi|nongkrong|makan} enak di {{place}}. {ntar gw share lokasinya|gw pin loc ya|tau kan yg itu}' },
      { from: 'A', text: '{thanks ya lu emg bisa diandalin|makasih bgt|lu temen terbaik sih} 🥹' },
    ]
  },

  // 31. Nitip beli
  {
    topic: 'nitip',
    messages: [
      { from: 'A', text: '{{name}} {lu mau ke|lg di daerah|ntar lewat} {{place}} ga {hari ini?|ntar?|sore ini?}' },
      { from: 'B', text: '{iya ntar sore|iya emang knp?|kayaknya iya}. {emang knp?|ada apa?|mau nitip?}' },
      { from: 'A', text: '{gw nitip dong beliin|tolongin beliin|bisa ga beliin gw} {{food}} 🥺' },
      { from: 'B', text: '{bisa2|boleh|oke}. {mau brp?|brp porsi?|yg mana?}' },
      { from: 'A', text: '{1 aja cukup|2 porsi ya|yg regular aja}. {brp duit?|gw tf skrg|perlu bayar brp?}' },
      { from: 'B', text: '{sekitar|kurang lebih} {{price}} {aja sih|an}. {tf aja ke rek biasa|ntar aja bayarnya|gw tausahin dulu}' },
      { from: 'A', text: '{done!|udah gw tf|oke ntar gw bayar}. makasih {banyak ya|bgt|{{name}}} 💕' },
      { from: 'B', text: '{sama2|sip|no problem} {ntar gw kabarin kalo udah beli ya|otw ya|bentar lagi gw beli}' },
    ]
  },

  // 32. Reunion plan
  {
    topic: 'reunion',
    messages: [
      { from: 'A', text: '{{name}} {eh ada wacana reunion nih|reunion yuk|kumpul2 lg yuk} {{day}}' },
      { from: 'B', text: '{wah seriusan??|asik!|mau bgt} {siapa aja yg dateng?|udah brp org?|rame ga?}' },
      { from: 'A', text: '{lumayan banyak sih|udah confirm sekitar 10 org|baru 5 tp nambah terus}' },
      { from: 'B', text: '{dimana tempatnya?|mau di mana?|venue nya dimana?}' },
      { from: 'A', text: 'di {{place}}. {{time}} {mulai|kumpul|ketemuan}' },
      { from: 'B', text: '{gw usahain dateng deh|pasti dateng!|insyaallah gw hadir}. {kangen juga sih sama anak2|udah lama bgt ga ketemu|pengen nostalgia} 😄' },
      { from: 'A', text: '{harus dateng ya!|wajib hadir!|jangan cancel}. {ga lengkap tanpa lu wkwk|rame bgt pasti|seru nih} {😊|🙌}' },
    ]
  },

  // 33. Anime / manga
  {
    topic: 'anime',
    messages: [
      { from: 'A', text: '{{name}} {nonton anime apa lg?|baca manga apa?|ada rekomendasi anime?}' },
      { from: 'B', text: '{gw lg nonton|baru selesai|lg marathon} {One Piece|Jujutsu Kaisen|Demon Slayer|Solo Leveling|Chainsaw Man|Spy x Family} {seru bgt|gila plotnya|peak fiction}' },
      { from: 'A', text: '{wah itu bagus!|gw jg nonton itu|blm nonton nih}. {episode brp udah?|udah sampe mana?|spoiler jangan ya} {😂|wkwk}' },
      { from: 'B', text: '{udah ep terbaru|masih ngejar|baru mulai lg}. {lu nonton {Frieren|Blue Lock|Oshi no Ko|Dandadan} ga?|coba nonton itu deh|ini season banyak yg bagus}' },
      { from: 'A', text: '{belom!|mau nonton tp blm sempet|itu bagus ya?}. {masukin watchlist deh|ntar gw marathon weekend|coba deh}' },
      { from: 'B', text: '{trust me lu bakal ketagihan|10/10 sih|jangan skip opening nya} {🔥|😂|👍}' },
    ]
  },

  // 34. TikTok / social media
  {
    topic: 'tiktok',
    messages: [
      { from: 'A', text: '{{name}} {FYP lu isinya apa?|TikTok lu algo nya bagus ga?|gw nemuin TikTok kocak bgt}' },
      { from: 'B', text: '{wkwk FYP gw random bgt|isinya kucing mulu|comedy semua}. {emang kenapa?|yg mana?|kirimin dong}' },
      { from: 'A', text: '{ada creator yg bikin konten|ada video|nemu} {masak tp chaos bgt|prank lucu|edit keren bgt} {wkwk|ngakak gw|gila}' },
      { from: 'B', text: '{HAHA kirim dong|mana linknya|share ke gw}. {gw butuh ketawa|bosen nih|penasaran}' },
      { from: 'A', text: '{nih gw forward|bentar ya gw cari|cek DM}. {btw lu posting TikTok ga?|lu bikin konten jg ga?|mau bikin TikTok bareng ga wkwk}' },
      { from: 'B', text: '{ogah malu gw|wkwk blm pede|pengen sih tp males}. {nonton aja deh|jadi penonton setia|viewer aja gw} 😂' },
    ]
  },

  // 35. Pet / binatang peliharaan
  {
    topic: 'peliharaan',
    messages: [
      { from: 'A', text: '{{name}} {kucing gw lg lucu bgt|anjing gw baru belajar trick|peliharaan gw lg sakit nih} {😍|🥺|😢}' },
      { from: 'B', text: '{{name}} {foto dong!|kasian kenapa?|wah lucu bgt pasti}. {gw jg pengen pelihara|gw kangen kucing gw|gw baru adopt nih}' },
      { from: 'A', text: '{nih liat|cek foto ini|iya nih}. {dia baru bisa {duduk|salaman|guling2}|lg tidur pose lucu|matanya bulat bgt}' },
      { from: 'B', text: '{GEMES BGT|aduh lucunyaa|gw mau culik} 🥺. {nama nya siapa?|umur brp?|jenis apa?}' },
      { from: 'A', text: '{namanya {Mochi|Kopi|Luna|Oreo|Simba}|{5|3|8|2} bulan|campuran sih tp lucu}. {main ke rumah gw aja kalo mau liat|kapan2 playdate yuk|mau adopsi jg?}' },
      { from: 'B', text: '{MAU BGT|gas gw kesana|iya dong}. {{day}} {gw mampir ya|bisa ga?|free ga lu?} {😍|🐱|🐶}' },
    ]
  },
];

// ============================================================
// Spin syntax resolver
// ============================================================

/**
 * Resolve spin syntax: {opsi1|opsi2|opsi3} → picks one randomly
 * Supports nested: {a|b {c|d}} (resolves inner first)
 */
function resolveSpin(text) {
  // Keep resolving until no more spin syntax
  let result = text;
  let maxIterations = 10; // prevent infinite loops
  while (result.includes('{') && result.includes('|') && maxIterations-- > 0) {
    result = result.replace(/\{([^{}]+)\}/g, (match, content) => {
      if (!content.includes('|')) return match; // not a spin, leave as is
      const options = content.split('|');
      return options[Math.floor(Math.random() * options.length)].trim();
    });
  }
  return result;
}

// ============================================================
// Helper functions
// ============================================================

/**
 * Get a random value from a substitution pool
 */
function getRandomSub(key) {
  const pool = substitutions[key];
  if (!pool || !pool.length) return `{{${key}}}`;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Apply substitutions to a message template
 * Each call generates fresh random values
 */
function applySubstitutions(text) {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return getRandomSub(key);
  });
}

/**
 * Get a random conversation template with substitutions + spin pre-applied
 * Returns { topic, messages: [{ from: 'A'|'B', text: string }] }
 */
function getRandomConversation() {
  const template = conversationTemplates[Math.floor(Math.random() * conversationTemplates.length)];
  
  // Generate consistent substitutions for this conversation
  // (same {{name}} throughout, etc.)
  const subs = {};
  for (const key of Object.keys(substitutions)) {
    subs[key] = getRandomSub(key);
  }
  
  const messages = template.messages.map(msg => ({
    from: msg.from,
    // First apply {{var}} substitutions, then resolve {spin|syntax}
    text: resolveSpin(
      msg.text.replace(/\{\{(\w+)\}\}/g, (match, key) => subs[key] || match)
    )
  }));
  
  return { topic: template.topic, messages };
}

module.exports = {
  conversationTemplates,
  substitutions,
  getRandomConversation,
  applySubstitutions,
  getRandomSub,
  resolveSpin,
};

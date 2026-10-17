import { slugifyCity } from "@/lib/cities";

/** "About the city" copy for the city landing pages. Short, factual, general-knowledge only. */
export type CityAbout = { famous: string; renters: string };

const RAW: Record<string, CityAbout> = {
  Jaipur: { famous: "the Pink City — Amer Fort, Hawa Mahal, City Palace and block-printed textiles; also a big coaching, IT and startup hub", renters: "students, working professionals and families" },
  Delhi: { famous: "India's capital — Red Fort, India Gate, Chandni Chowk street food and top universities like DU and JNU", renters: "students, civil-services aspirants and professionals" },
  Mumbai: { famous: "the financial capital — Gateway of India, Marine Drive, Bollywood and the local trains", renters: "working professionals, finance and media workers" },
  Bengaluru: { famous: "India's Silicon Valley — tech parks, startups, pleasant weather, pubs and parks", renters: "IT professionals, startup teams and students" },
  Hyderabad: { famous: "Charminar, biryani, Hitech City and a large IT and pharma industry", renters: "IT professionals and students" },
  Chennai: { famous: "Marina Beach, temples, filter coffee, the auto industry and a strong education scene", renters: "professionals, engineers and students" },
  Kolkata: { famous: "the City of Joy — Howrah Bridge, Victoria Memorial, sweets, literature and Durga Puja", renters: "students, professionals and families" },
  Pune: { famous: "the Oxford of the East — many colleges, IT parks, Shaniwar Wada and a lively food scene", renters: "students and IT professionals" },
  Ahmedabad: { famous: "India's first UNESCO World Heritage City — Sabarmati Ashram, textiles, business and Gujarati food", renters: "professionals, traders and students" },
  Lucknow: { famous: "the City of Nawabs — Bara Imambara, tunday kebabs, chikankari and Awadhi culture", renters: "students, government-job aspirants and professionals" },
  Kanpur: { famous: "an industrial and leather hub with IIT Kanpur and a large student population", renters: "students and factory/office workers" },
  Nagpur: { famous: "the Orange City and the geographic centre of India, with a growing logistics and education sector", renters: "students and professionals" },
  Indore: { famous: "India's cleanest city for years — street food at Sarafa Bazaar, IIT and IIM Indore and a fast-growing business scene", renters: "students and young professionals" },
  Bhopal: { famous: "the City of Lakes — Upper Lake, museums, MANIT and many colleges", renters: "students and government employees" },
  Patna: { famous: "one of the oldest cities in the world — Golghar, Patna Sahib, and a large competitive-exam student base", renters: "exam aspirants and students" },
  Ranchi: { famous: "the City of Waterfalls — Hundru Falls, Tagore Hill and a growing education hub", renters: "students and professionals" },
  Chandigarh: { famous: "Le Corbusier's planned city — Rock Garden, Sukhna Lake, wide roads and good colleges", renters: "students and professionals" },
  Gurugram: { famous: "the Millennium City — corporate offices, malls and a big MNC workforce", renters: "corporate professionals" },
  Noida: { famous: "a planned city with IT and media companies, universities and the Delhi Metro link", renters: "IT professionals and students" },
  Ghaziabad: { famous: "an industrial city on the Delhi border with metro and rapid-rail connectivity", renters: "NCR commuters and professionals" },
  Faridabad: { famous: "an industrial town with Surajkund Mela and easy Delhi access", renters: "factory staff and NCR commuters" },
  "Greater Noida": { famous: "wide planned sectors, the Expo Centre and many universities", renters: "university students and professionals" },
  Dehradun: { famous: "the gateway to Mussoorie — pleasant weather, FRI, boarding schools and colleges", renters: "students and professionals" },
  Kota: { famous: "India's coaching capital for JEE and NEET, with lakhs of students", renters: "students preparing for entrance exams" },
  Jodhpur: { famous: "the Blue City — Mehrangarh Fort, Umaid Bhawan Palace, AIIMS and IIT Jodhpur", renters: "students and professionals" },
  Udaipur: { famous: "the City of Lakes — Lake Pichola, City Palace and a thriving tourism industry", renters: "tourism staff, students and professionals" },
  Ajmer: { famous: "Ajmer Sharif Dargah, Pushkar nearby and many schools and colleges", renters: "students and working professionals" },
  Bikaner: { famous: "Junagarh Fort, bhujia and sweets, and a sizeable college population", renters: "students and professionals" },
  Surat: { famous: "the Diamond and Silk City — textiles, diamond polishing and great street food", renters: "workers, traders and professionals" },
  Vadodara: { famous: "Laxmi Vilas Palace, MS University and an industrial belt", renters: "students and professionals" },
  Rajkot: { famous: "a major engineering and industrial hub in Saurashtra", renters: "professionals and students" },
  Visakhapatnam: { famous: "a port city with beaches, the Eastern Naval Command and steel and IT industries", renters: "professionals and students" },
  Coimbatore: { famous: "the Manchester of South India — textiles, engineering colleges and pumps industry", renters: "students and professionals" },
  Kochi: { famous: "the Queen of the Arabian Sea — Fort Kochi, backwaters, the port and Infopark", renters: "IT and shipping professionals" },
  Thiruvananthapuram: { famous: "Kerala's capital — Padmanabhaswamy Temple, Technopark and beaches like Kovalam", renters: "IT professionals and students" },
  Mysuru: { famous: "the City of Palaces — Mysore Palace, Dussehra, yoga and a calm lifestyle", renters: "students and professionals" },
  Bhubaneswar: { famous: "the Temple City — Lingaraj Temple, KIIT, IIT and a growing IT sector", renters: "students and professionals" },
  Guwahati: { famous: "the gateway to the North-East — Kamakhya Temple, the Brahmaputra and a regional education hub", renters: "students and professionals" },
  Varanasi: { famous: "one of the oldest living cities — the ghats of the Ganga, Kashi Vishwanath and BHU", renters: "students and researchers" },
  Prayagraj: { famous: "Triveni Sangam, the Kumbh Mela, Allahabad University and civil-services coaching", renters: "exam aspirants and students" },
  Agra: { famous: "the Taj Mahal, Agra Fort and petha, with a large tourism industry", renters: "tourism workers and students" },
  Meerut: { famous: "a sports-goods and education hub in NCR with Rapid Rail connectivity", renters: "students and commuters" },
  Amritsar: { famous: "the Golden Temple, Wagah Border and Punjabi food", renters: "students and professionals" },
  Ludhiana: { famous: "the Manchester of India — hosiery, bicycles and industry", renters: "workers and professionals" },
  Jalandhar: { famous: "a sports-goods and leather hub with several colleges", renters: "students and professionals" },
  Raipur: { famous: "Chhattisgarh's capital — steel, IIM Raipur and AIIMS", renters: "professionals and students" },
  Vijayawada: { famous: "a business and education centre on the Krishna river with the Kanaka Durga Temple", renters: "students and professionals" },
  Mangaluru: { famous: "a coastal city known for beaches, seafood, colleges and the New Mangalore Port", renters: "students and professionals" },
  Nashik: { famous: "the wine capital of India and a Kumbh city on the Godavari", renters: "professionals and students" },
  Aurangabad: { famous: "the gateway to the Ajanta and Ellora caves, with a strong industrial belt", renters: "industry workers and students" },
  "Navi Mumbai": { famous: "a planned city across the harbour from Mumbai — Vashi, Belapur and the new airport area", renters: "Mumbai commuters and professionals" },
  Thane: { famous: "the City of Lakes next to Mumbai, with metro and rail connectivity", renters: "Mumbai commuters and families" },
  Sikar: { famous: "a coaching and school hub of Shekhawati with Khatu Shyam nearby", renters: "students" },
  Alwar: { famous: "Sariska Tiger Reserve, Bala Quila and an NCR-linked industrial area", renters: "students and professionals" },
  Bhilwara: { famous: "the Textile City of Rajasthan", renters: "textile workers and professionals" },
  Jammu: { famous: "the City of Temples and the gateway to Vaishno Devi", renters: "students and government employees" },
  Shimla: { famous: "the Queen of Hills — Mall Road, Ridge, apples and colonial-era charm", renters: "students and professionals" },
};

const BY_SLUG = new Map(Object.entries(RAW).map(([k, v]) => [slugifyCity(k), v]));

/** About text for a city. Known cities get specifics; any other city gets a generic, honest paragraph. */
export function cityAbout(city: string): { heading: string; paragraphs: string[]; specific: boolean } {
  const a = BY_SLUG.get(slugifyCity(city));
  if (a) {
    return {
      heading: `About ${city}`,
      specific: true,
      paragraphs: [
        `${city} is known for ${a.famous}.`,
        `Rentals here are most in demand among ${a.renters}. On Rentalos you can compare rooms, PGs and flats in ${city} by rent, room size and who the room is for (boys, girls or family), and see live photos and videos before you visit.`,
      ],
    };
  }
  return {
    heading: `About renting in ${city}`,
    specific: false,
    paragraphs: [
      `Looking for a room, PG or flat in ${city}? Rentalos lists rooms directly from owners, with live photos and videos, clear room size (1 BHK, 2 BHK…), who the room is for, and the owner's rental terms — no brokerage.`,
    ],
  };
}

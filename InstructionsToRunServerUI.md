# Τοπική εκτέλεση του Verifier UI (eudi-web-verifier)

Οδηγίες για να τρέξει το verifier UI τοπικά, συνδεδεμένο με τον **τοπικό** backend
(`eudi-srv-verifier-endpoint`) μέσω HTTPS, για το feature με υποστήριξη `transaction_data`.

## 1. Προαπαιτούμενα

- **Ο backend τρέχει ήδη** σε `https://localhost:8080` (δες τις οδηγίες του `grnet/eudi-srv-verifier-endpoint`, στο branch demoVerifier4v10).
  Στο log του backend πρέπει να φαίνεται `Netty started on port 8080 (https)`.
- **nvm** εγκατεστημένο.
- **Node 20** (το Angular 19 θέλει ≥ 18.19· με παλιές εκδόσεις, π.χ. v15, αποτυγχάνει).

## 2. Πρώτη φορά

```bash
cd eudi-web-verifier
nvm install 20      # μόνο αν δεν υπάρχει ήδη το Node 20
nvm use 20
node -v             # πρέπει να δείχνει v20.x
npm install
```

## 3. Κάθε φορά

```bash
cd eudi-web-verifier
nvm use 20
npm start
```

Όταν δεις `Local: http://localhost:4200/`, το UI είναι έτοιμο.
Το `nvm use 20` ισχύει μόνο για το τρέχον terminal — σε νέο terminal ξανατρέχει.

## 5. Αποδοχή του πιστοποιητικού (μία φορά ανά browser)

Το UI καλεί τον backend **απευθείας** από τον browser, και ο backend έχει self-signed πιστοποιητικό.

1. Άνοιξε στον browser `https://localhost:8080`.
2. Στην προειδοποίηση πάτα **Advanced → Proceed to localhost (unsafe)**. Μια σελίδα σφάλματος/κενή είναι εντάξει.
3. Μετά άνοιξε `http://localhost:4200`.

Αν το ξεχάσεις, τα requests αποτυγχάνουν σιωπηλά ή βγαίνει "Oups something went wrong".

## 6. Δημιουργία request προς το wallet

1. Διάλεξε **PID**, format **SD-JWT VC** (όχι mdoc).
2. Διάλεξε **συγκεκριμένα attributes** (όχι "ALL_ATTRIBUTES"). Να επιλεγούν attributes με ίδια ονομασία με αυτά στο πιστοποιητικό. 
**Το παράδειγμα που ελέγχτηκε** και παίζει είναι για PID πιστοποιητικό που εκδόθηκε όπως στο eudi/eudi-app-android-wallet-ui, από το δικό τους ISSUER με επιλογή formEU. 
Έπειτα επιλέχτηκαν συγκεκριμένα attributes όπως given name, family name.
3. Στις επιλογές (tab "Submit with Redirects"):
  - Profile / scheme: **`openid4vp`** (όχι `haip`, που είναι το default)
  - Request URI method: **`get`** (όχι `post`/`post_get`)
4. Submit → εμφανίζεται QR και link.
  - **Κινητό:** σκάναρε το QR (χρειάζεται `adb reverse tcp:8080 tcp:8080`).
  - **Emulator:** πέρασε το link στον emulator (π.χ. μέσω `deeplink.html` + `python3 -m http.server`). 
Προς το παρόν κάποιες φορές αποτυγχάνει στον emulator γιατί χρειάζεται διαφορετικές ρυθμίσεις όταν τρέχει ο server για να μπορεί να αναγνωρίσει τα localhost requests.
5. Κάθε link χρησιμοποιείται **μία φορά**. Για νέα δοκιμή, φτιάξε νέο request.


## Σειρά εκκίνησης (σύνοψη)

1. Backend (`eudi-srv-verifier-endpoint`) → `./gradlew bootRun` με τα env vars.(δες τις οδηγίες του `grnet/eudi-srv-verifier-endpoint`, στο branch demoVerifier4v10 )
2. `adb reverse tcp:8080 tcp:8080` (αν χρησιμοποιείς κινητό ή emulator με localhost)
3. UI → `nvm use 20` → `npm start`
4. Browser → `https://localhost:8080` (accept) → `http://localhost:4200`

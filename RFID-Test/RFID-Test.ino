
/*
 * This Arduino Nano code was developed by newbiely.com
 *
 * This Arduino Nano code is made available for public use without any restriction
 *
 * For comprehensive instructions and wiring diagrams, please visit:
 * https://newbiely.com/tutorials/arduino-nano/arduino-nano-rfid
 */

#include <SPI.h>
#include <MFRC522.h>

#define RC522_SS_PIN 10 // The Arduino Nano pin connected to RC522's SS pin
#define RC522_RST_PIN 5 // The Arduino Nano pin connected to RC522's RST pin

#define DATA_START_PAGE 4
#define DATA_MAX_PAGE 134

MFRC522 rfid(RC522_SS_PIN, RC522_RST_PIN);

// Write one NTAG page (4 bytes)
bool NTAG_WritePage(byte page, const byte data[4]) {
    byte buffer[16] = {0};

    // Only first 4 bytes are used by NTAG215
    memcpy(buffer, data, 4);

    MFRC522::StatusCode status =
        rfid.MIFARE_Write(page, buffer, 16);

    if (status != MFRC522::STATUS_OK) {
        Serial.print("Write failed: ");
        Serial.println(rfid.GetStatusCodeName(status));
        return false;
    }

    return true;
}

// Read one NTAG page (4 bytes)
bool NTAG_ReadPage(byte page, byte data[4]) {
    byte buffer[18];
    byte size = sizeof(buffer);

    MFRC522::StatusCode status =
        rfid.MIFARE_Read(page, buffer, &size);

    if (status != MFRC522::STATUS_OK) {
        Serial.print("Read failed: ");
        Serial.println(rfid.GetStatusCodeName(status));
        return false;
    }

    // MIFARE_Read returns 4 pages (16 bytes)
    memcpy(data, buffer, 4);

    return true;
}

void writeExample(int page = 4) {
  byte writeData[4] = {0x11, 0x22, 0x33, 0x44};

    // User memory starts at page 4
    if (NTAG_WritePage(page, writeData)) {
        Serial.println("Page written");
    }
}

void readExample(int page = 4) {
  byte readData[4];

    if (NTAG_ReadPage(page, readData)) {
        Serial.print("Data: ");

        for (int i = 0; i < 4; i++) {
            Serial.print(readData[i], HEX);
            Serial.print(' ');
        }

        Serial.println();
    }
}

void setup() {
  Serial.begin(9600);
  SPI.begin(); // init SPI bus
  rfid.PCD_Init(); // init MFRC522

  Serial.println("Tap RFID/NFC Tag on reader");
}

void loop() {
  if (rfid.PICC_IsNewCardPresent()) { // new tag is available
    if (rfid.PICC_ReadCardSerial()) { // NUID has been readed
      Serial.println("Reading pages...");

      readExample(4);

      Serial.println("Write data");
      writeExample(4);

      Serial.println("Read data:");
      readExample(4);

      rfid.PICC_HaltA(); // halt PICC
      rfid.PCD_StopCrypto1(); // stop encryption on PCD
    }
  }
}

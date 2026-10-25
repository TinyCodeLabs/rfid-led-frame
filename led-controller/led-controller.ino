
/*
 * This Arduino Nano code was developed by newbiely.com
 *
 * This Arduino Nano code is made available for public use without any restriction
 *
 * For comprehensive instructions and wiring diagrams, please visit:
 * https://newbiely.com/tutorials/arduino-nano/arduino-nano-rfid
 */
#include "defines.h"
#include <SPI.h>
#include <MFRC522.h>
#include "ndef.h"

#include <Adafruit_NeoPixel.h>


Adafruit_NeoPixel pixels(NUMPIXELS, LED_PIN, NEO_GRB + NEO_KHZ800);

MFRC522 rfid(RC522_SS_PIN, RC522_RST_PIN);

bool tagPresent = false;

bool isTagStillPresent() {
    byte bufferATQA[2];
    byte bufferSize = sizeof(bufferATQA);

    return rfid.PICC_WakeupA(bufferATQA, &bufferSize)
           == MFRC522::STATUS_OK;
}

void setup() {
  Serial.begin(9600);
  SPI.begin(); // init SPI bus
  rfid.PCD_Init(); // init MFRC522

  pixels.begin();

  Serial.println("Tap RFID/NFC Tag on reader");
}

void loop() {
  if (rfid.PICC_IsNewCardPresent()) { // new tag is available
    if (rfid.PICC_ReadCardSerial()) { // NUID has been readed
      Serial.println("Reading...");

      tagPresent = true;

      uint8_t data[NUMPIXELS * 3 + 10];
      uint16_t len;
      
      if (readLedTag(rfid, data, sizeof(data), len))
      {
          Serial.print("Read ");
          Serial.print(len / 3);
          Serial.println(" stored LEDs, interpolating to 88...");

          pixels.clear();

          uint16_t storedLeds = len / 3;  // Number of LEDs stored on tag (should be 44)

          // Interpolate stored LEDs to all 88 display LEDs
          for (uint8_t led = 0; led < NUMPIXELS; led++)
          {
              // Map display LED index to stored LED position
              float storedPos = (float)led * (storedLeds - 1) / (NUMPIXELS - 1);
              uint16_t idx1 = (uint16_t)storedPos;
              uint16_t idx2 = (idx1 + 1 < storedLeds) ? idx1 + 1 : idx1;
              float blend = storedPos - idx1;

              // Get colors from stored LEDs
              uint8_t r1 = data[idx1 * 3];
              uint8_t g1 = data[idx1 * 3 + 1];
              uint8_t b1 = data[idx1 * 3 + 2];

              uint8_t r2 = data[idx2 * 3];
              uint8_t g2 = data[idx2 * 3 + 1];
              uint8_t b2 = data[idx2 * 3 + 2];

              // Linear interpolation
              uint8_t r = r1 + (r2 - r1) * blend;
              uint8_t g = g1 + (g2 - g1) * blend;
              uint8_t b = b1 + (b2 - b1) * blend;

              pixels.setPixelColor(led, pixels.Color(r, g, b));
          }

          pixels.show();
      }
      else
      {
          Serial.println("No valid v/led record found");
      }

      rfid.PICC_HaltA(); // halt PICC
      rfid.PCD_StopCrypto1(); // stop encryption on PCD
    }
  }
  
  if (tagPresent && !isTagStillPresent()) {
      Serial.println("Tag removed");
      tagPresent = false;
      pixels.clear();
      pixels.show();
  }
}

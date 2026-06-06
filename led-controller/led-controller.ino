
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

      uint8_t data[128];
      uint16_t len;
      
      if (readLedTag(rfid, data, sizeof(data), len))
      {
          Serial.print("Payload: ");

          pixels.clear();

          uint8_t led = 0;
      
          for (uint16_t i = 0; i+2 < len; i+=3)
          {
              Serial.print(data[i], HEX);
              Serial.print(data[i + 1], HEX);
              Serial.print(data[i + 2], HEX);
              Serial.print(" ");
              pixels.setPixelColor(led, pixels.Color(data[i], data[i+1], data[i+2]));
              led++;
          }
      
          Serial.println();
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

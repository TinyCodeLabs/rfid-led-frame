bool readLedTag(
    MFRC522 &rfid,
    uint8_t *outData,
    uint16_t outMaxLen,
    uint16_t &outLen)
{
    uint8_t raw[256];
    uint16_t rawLen = 0;

    // Read pages 4..39 (each MIFARE_Read reads 16 bytes / 4 pages)
    for (byte page = 4; page < 40; page += 4)
    {
        byte buffer[18];
        byte size = sizeof(buffer);

        if (rfid.MIFARE_Read(page, buffer, &size)
            != MFRC522::STATUS_OK)
        {
            return false;
        }

        memcpy(raw + rawLen, buffer, 16);
        rawLen += 16;
    }

    // Find NDEF TLV
    int tlv = -1;

    for (uint16_t i = 0; i < rawLen; i++)
    {
        if (raw[i] == 0x03)
        {
            tlv = i;
            break;
        }
    }

    if (tlv < 0)
        return false;

    // NDEF record starts after TLV type + TLV length field
    // TLV length uses variable encoding: 1 byte if < 255, else 0xFF + 2 bytes
    int rec = tlv + 2;
    if (raw[tlv + 1] == 0xFF) {
        // Long form TLV length: 0xFF followed by 2-byte big-endian length
        rec = tlv + 4;
    }

    uint8_t header = raw[rec];
    uint8_t typeLen = raw[rec + 1];

    // Handle variable-length payload encoding (NDEF spec)
    // SR flag (bit 4) determines if length is 1 byte (SR=1) or 4 bytes (SR=0)
    bool isSR = (header & 0x10) != 0;

    uint16_t payloadLen;
    uint8_t typeStart;

    if (isSR) {
        // Short Record: 1-byte payload length
        payloadLen = raw[rec + 2];
        typeStart = rec + 3;
    } else {
        // Long Record: 4-byte payload length (big-endian)
        payloadLen = ((uint32_t)raw[rec + 2] << 24) | ((uint32_t)raw[rec + 3] << 16) | ((uint32_t)raw[rec + 4] << 8) | raw[rec + 5];
        typeStart = rec + 6;
    }

    char mimeType[32];

    if (typeLen >= sizeof(mimeType))
        return false;

    memcpy(
        mimeType,
        &raw[typeStart],
        typeLen);

    mimeType[typeLen] = '\0';

    if (strcmp(mimeType, NDEF_MIME) != 0)
        return false;

    if (payloadLen > outMaxLen)
        payloadLen = outMaxLen;

    uint8_t payloadStart = typeStart + typeLen;
    memcpy(
        outData,
        &raw[payloadStart],
        payloadLen);

    outLen = payloadLen;

    return true;
}

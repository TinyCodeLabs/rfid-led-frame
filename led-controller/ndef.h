bool readLedTag(
    MFRC522 &rfid,
    uint8_t *outData,
    uint16_t outMaxLen,
    uint16_t &outLen)
{
    uint8_t raw[256];
    uint16_t rawLen = 0;

    // Read pages 4..39 (adjust if needed)
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

    // NDEF record starts after:
    // TLV type + TLV length
    int rec = tlv + 2;

    uint8_t header = raw[rec];
    uint8_t typeLen = raw[rec + 1];
    uint8_t payloadLen = raw[rec + 2];

    (void)header;

    char mimeType[32];

    if (typeLen >= sizeof(mimeType))
        return false;

    memcpy(
        mimeType,
        &raw[rec + 3],
        typeLen);

    mimeType[typeLen] = '\0';

    if (strcmp(mimeType, NDEF_MIME) != 0)
        return false;

    if (payloadLen > outMaxLen)
        return false;

    memcpy(
        outData,
        &raw[rec + 3 + typeLen],
        payloadLen);

    outLen = payloadLen;

    return true;
}

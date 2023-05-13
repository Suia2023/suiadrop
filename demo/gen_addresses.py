import secrets


if __name__ == '__main__':
    with open("whitelist.txt", "w") as f:
        for i in range(10000):
            address = "0x" + secrets.token_hex(32)
            f.write(address + "\n")

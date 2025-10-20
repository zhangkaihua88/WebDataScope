import msgpack
import zlib
import snappy # Import snappy
import json

def read_and_decode_bin(file_path):
    try:
        with open(file_path, 'rb') as f:
            compressed_data = f.read()
        
        decompressed_data = None
        # Try zlib decompression first
        try:
            decompressed_data = zlib.decompress(compressed_data)
        except zlib.error:
            # If zlib fails, try snappy decompression
            try:
                decompressed_data = snappy.decompress(compressed_data)
            except snappy.UncompressError:
                print("Error: Data is neither zlib nor snappy compressed.")
                return

        if decompressed_data is None:
            print("Error: Decompression failed.")
            return

        unpacker = msgpack.Unpacker(raw=False)
        unpacker.feed(decompressed_data)
        
        decoded_data = {}
        for item in unpacker:
            # Assuming the bin file contains a single msgpack object which is a dict
            if isinstance(item, dict):
                # Convert keys to strings if they are bytes
                decoded_data = {k.decode('utf-8') if isinstance(k, bytes) else k: v for k, v in item.items()}
                # Further nested key conversion if necessary
                for region_key, region_data in decoded_data.items():
                    if isinstance(region_data, dict) and 'dataset' in region_data:
                        dataset = region_data['dataset']
                        decoded_data[region_key]['dataset'] = {
                            k.decode('utf-8') if isinstance(k, bytes) else k: v
                            for k, v in dataset.items()
                        }

        # Save the JSON to a file
        output_file_path = "osis_data_decoded.json"
        with open(output_file_path, 'w', encoding='utf-8') as outfile:
            json.dump(decoded_data, outfile, indent=4, ensure_ascii=False)
        print(f"Successfully decoded and saved data to {output_file_path}")

    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    # Path to the .bin file inside the extension's data directory
    bin_file_path = "data/oth/osis_data.bin"
    read_and_decode_bin(bin_file_path)

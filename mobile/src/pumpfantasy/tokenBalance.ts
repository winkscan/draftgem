import { PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";
import { useConnection } from "../utils/ConnectionProvider";
import { CURRENCIES, getAssociatedTokenAddress } from "./currency";

/** The wallet's SKR balance in base units (0 when it has no SKR account yet). Refreshes every 15 s. */
export function useSkrBalance(owner: PublicKey | null) {
  const { connection } = useConnection();
  return useQuery({
    queryKey: ["skr-balance", owner?.toBase58()],
    enabled: !!owner,
    refetchInterval: 15_000,
    queryFn: async (): Promise<bigint> => {
      const ata = getAssociatedTokenAddress(owner!, CURRENCIES.SKR.mint!);
      try {
        const res = await connection.getTokenAccountBalance(ata);
        return BigInt(res.value.amount);
      } catch {
        return 0n; // no token account yet
      }
    },
  });
}

from mcp.server.fastmcp import FastMCP

from retrieval import SOP_DIR, read_sop, search_sop_manuals


mcp = FastMCP("hotel-sop-manuals")


@mcp.resource("sop://late_checkout_policy")
def late_checkout_policy() -> str:
    """Hotel policy for late checkout requests."""
    return read_sop(SOP_DIR / "late_checkout_policy.md")


@mcp.resource("sop://vip_guest_protocols")
def vip_guest_protocols() -> str:
    """Hotel procedures for VIP guests."""
    return read_sop(SOP_DIR / "vip_guest_protocols.md")


@mcp.resource("sop://lost_and_found")
def lost_and_found() -> str:
    """Hotel lost and found procedures."""
    return read_sop(SOP_DIR / "lost_and_found.md")


@mcp.resource("sop://room_upgrade_policy")
def room_upgrade_policy() -> str:
    """Hotel room upgrade policy."""
    return read_sop(SOP_DIR / "room_upgrade_policy.md")


mcp.tool()(search_sop_manuals)


if __name__ == "__main__":
    mcp.run(transport="stdio")

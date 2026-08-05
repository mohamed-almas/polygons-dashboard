from geo import coords_to_wkt

def test_coords_to_wkt_simple_square():
    coord_str = "[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]"
    result = coords_to_wkt(coord_str)
    assert result == "POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))"

def test_coords_to_wkt_real_sample():
    coord_str = "[[-61.8892, -39.20235], [-61.6009, -38.96826], [-62.37628, -38.59966], [-62.56759, -38.77408], [-61.8892, -39.20235]]"
    result = coords_to_wkt(coord_str)
    assert result.startswith("POLYGON((-61.8892 -39.20235,")
    assert result.endswith("-61.8892 -39.20235))")
